import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestedTarget } from "./atlas-platform-targets.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const runtimeRoot = path.join("resources", "embedding-runtime");
const target = getRequestedTarget();

runNpm([
  "install",
  "--prefix",
  runtimeRoot,
  "--omit=dev",
  "--no-package-lock",
  `--os=${target.os}`,
  `--cpu=${target.cpu}`,
]);

runNode([
  path.join(scriptDir, "prune-embedding-runtime.mjs"),
  "--target",
  target.name,
]);

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

  if (/^[A-Za-z0-9_./\\:=+-]+$/.test(text)) {
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
