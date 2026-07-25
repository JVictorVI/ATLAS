import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestedTarget } from "./atlas-platform-targets.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const target = getRequestedTarget();
const runtimeNodeModules = path.join(
  projectRoot,
  "resources",
  "embedding-runtime",
  "node_modules",
);
const napiRoot = path.join(
  runtimeNodeModules,
  "onnxruntime-node",
  "bin",
  "napi-v3",
);
const imgRoot = path.join(runtimeNodeModules, "@img");

await pruneOnnxRuntime();
await pruneSharpPackages();

console.log(`[ATLAS] Runtime de embeddings reduzido para ${target.name}.`);

async function pruneOnnxRuntime() {
  const [keepPlatform, keepArch] = target.onnxRuntimePath;
  const platforms = await readDirectoryNames(napiRoot);

  for (const platformName of platforms) {
    const platformPath = path.join(napiRoot, platformName);

    if (platformName !== keepPlatform) {
      await removeInsideRoot(napiRoot, platformPath);
      continue;
    }

    const archNames = await readDirectoryNames(platformPath);

    for (const archName of archNames) {
      if (archName !== keepArch) {
        await removeInsideRoot(napiRoot, path.join(platformPath, archName));
      }
    }
  }
}

async function pruneSharpPackages() {
  const keep = new Set(["colour", ...target.sharpPackages]);
  const packageNames = await readDirectoryNames(imgRoot);

  for (const packageName of packageNames) {
    if (!keep.has(packageName)) {
      await removeInsideRoot(imgRoot, path.join(imgRoot, packageName));
    }
  }
}

async function readDirectoryNames(directoryPath) {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function removeInsideRoot(root, targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Caminho invalido para limpeza: ${resolvedTarget}`);
  }

  await rm(resolvedTarget, { recursive: true, force: true });
}
