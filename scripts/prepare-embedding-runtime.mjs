import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getRequestedTarget } from "./atlas-platform-targets.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const runtimeRoot = path.join("resources", "embedding-runtime");
const target = getRequestedTarget();
const runtimeNodeModules = path.join(projectRoot, runtimeRoot, "node_modules");
const onnxRuntimeRoot = path.join(runtimeNodeModules, "onnxruntime-node");
const [onnxPlatform, onnxArch] = target.onnxRuntimePath;
const onnxRuntimeBinDir = path.join(
  onnxRuntimeRoot,
  "bin",
  "napi-v3",
  onnxPlatform,
  onnxArch,
);
const onnxRuntimeBinding = path.join(
  onnxRuntimeBinDir,
  "onnxruntime_binding.node",
);
const sharpRoot = path.join(runtimeNodeModules, "sharp");
const imgRoot = path.join(runtimeNodeModules, "@img");
const require = createRequire(import.meta.url);

runNpm([
  "install",
  "--prefix",
  runtimeRoot,
  "--omit=dev",
  "--include=optional",
  "--no-package-lock",
  `--os=${target.os}`,
  `--cpu=${target.cpu}`,
]);

await ensureOnnxRuntimeNativeFiles();
await ensureSharpNativeFiles();

runNode([
  path.join(scriptDir, "prune-embedding-runtime.mjs"),
  "--target",
  target.name,
]);

assertOnnxRuntimeBinding();
await assertSharpNativeFiles();

async function ensureOnnxRuntimeNativeFiles() {
  if (existsSync(onnxRuntimeBinding)) {
    return;
  }

  const packageJson = JSON.parse(
    await readFile(path.join(onnxRuntimeRoot, "package.json"), "utf8"),
  );
  const packageSpec = `${packageJson.name}@${packageJson.version}`;
  const nativePrefix = `package/bin/napi-v3/${onnxPlatform}/${onnxArch}/`;

  console.log(
    `[ATLAS] Binario nativo do ONNX Runtime ausente para ${target.name}. ` +
      `Recuperando ${packageSpec}...`,
  );

  await extractPackage(packageSpec, onnxRuntimeRoot, {
    strip: 1,
    filter: (entryPath) => entryPath.startsWith(nativePrefix),
  });

  assertOnnxRuntimeBinding();
}

async function ensureSharpNativeFiles() {
  const sharpPackageJson = JSON.parse(
    await readFile(path.join(sharpRoot, "package.json"), "utf8"),
  );

  for (const packageName of target.sharpPackages) {
    if (await hasSharpPackageRuntime(packageName)) {
      continue;
    }

    const scopedName = `@img/${packageName}`;
    const version = sharpPackageJson.optionalDependencies?.[scopedName];

    if (!version) {
      throw new Error(
        `[ATLAS] Dependencia opcional do Sharp nao encontrada: ${scopedName}`,
      );
    }

    const packageSpec = `${scopedName}@${version}`;
    const packageRoot = path.join(imgRoot, packageName);

    console.log(
      `[ATLAS] Runtime nativo do Sharp ausente para ${target.name}. ` +
        `Recuperando ${packageSpec}...`,
    );

    await extractPackage(packageSpec, packageRoot);
  }

  await assertSharpNativeFiles();
}

function assertOnnxRuntimeBinding() {
  if (existsSync(onnxRuntimeBinding)) {
    return;
  }

  throw new Error(
    `[ATLAS] Falha ao preparar o ONNX Runtime para ${target.name}. ` +
      `Arquivo esperado nao encontrado: ${onnxRuntimeBinding}`,
  );
}

async function assertSharpNativeFiles() {
  for (const packageName of target.sharpPackages) {
    if (await hasSharpPackageRuntime(packageName)) {
      continue;
    }

    throw new Error(
      `[ATLAS] Falha ao preparar o Sharp para ${target.name}. ` +
        `Runtime esperado nao encontrado em ${path.join(imgRoot, packageName)}`,
    );
  }
}

async function hasSharpPackageRuntime(packageName) {
  const packageRoot = path.join(imgRoot, packageName);

  if (packageName.startsWith("sharp-libvips-")) {
    const libDir = path.join(packageRoot, "lib");
    const entries = await readDirectoryNames(libDir);
    return entries.some((entry) => entry.startsWith("libvips-cpp.so."));
  }

  return existsSync(path.join(packageRoot, "lib", `${packageName}.node`));
}

async function extractPackage(packageSpec, destination, options = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "atlas-npm-pack-"));

  try {
    await mkdir(destination, { recursive: true });
    runNpm(["pack", packageSpec, "--pack-destination", tempDir]);

    const tarballs = (await readdir(tempDir)).filter((entry) =>
      entry.endsWith(".tgz"),
    );

    if (tarballs.length !== 1) {
      throw new Error(
        `[ATLAS] Esperado 1 tarball para ${packageSpec}, encontrados ${tarballs.length}.`,
      );
    }

    const tar = require(path.join(runtimeNodeModules, "tar"));

    await tar.x({
      file: path.join(tempDir, tarballs[0]),
      cwd: destination,
      strip: options.strip ?? 1,
      filter: options.filter,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function readDirectoryNames(directoryPath) {
  try {
    return await readdir(directoryPath);
  } catch {
    return [];
  }
}

function runNpm(args) {
  if (process.platform === "win32") {
    runWindowsShim("npm", args);
    return;
  }

  run("npm", args);
}

function runNode(args) {
  run(process.execPath, args);
}

function runWindowsShim(command, args) {
  run(process.env.ComSpec || "cmd.exe", [
    "/d",
    "/c",
    [command, ...args].map(quoteCmdArg).join(" "),
  ]);
}

function quoteCmdArg(value) {
  const text = String(value);

  if (/^[A-Za-z0-9_./\\:=+@-]+$/.test(text)) {
    return text;
  }

  return `"${text
    .replace(/%/g, "%%")
    .replace(/(["^&|<>()])/g, "^$1")}"`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ATLAS_PACKAGE_TARGET: target.name,
      npm_config_os: target.os,
      npm_config_cpu: target.cpu,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
