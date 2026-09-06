import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRequestedTarget,
  SUPPORTED_TARGETS,
} from "./atlas-platform-targets.mjs";

const targetName = process.argv[2] ?? "";
const target = targetName
  ? SUPPORTED_TARGETS[targetName]
  : getRequestedTarget(process.argv.slice(2));

if (!target) {
  throw new Error(
    `[ATLAS] Target de VSIX nao suportado: ${targetName}. ` +
      `Targets suportados: ${Object.keys(SUPPORTED_TARGETS).join(", ")}.`,
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-vsix-ignore-"));
const ignoreFile = path.join(temporaryDir, ".vscodeignore");
const otherTargets = Object.keys(SUPPORTED_TARGETS).filter(name => name !== target.name);
fs.writeFileSync(ignoreFile, [
  fs.readFileSync(path.join(root, ".vscodeignore"), "utf8"),
  ...otherTargets.flatMap(name => [`resources/chroma/${name}/**`, `resources/linux-runtime/${name}/**`]),
  ...(target.os === "linux" ? [] : ["resources/linux-runtime/**"]),
].join("\n") + "\n");
const args = [
  "vsce",
  "package",
  "--target",
  target.name,
  "--out",
  target.vsixOut,
  "--ignore-other-target-folders",
  "--ignoreFile",
  ignoreFile,
];
try {
  const result = process.platform === "win32" ? spawnWindowsShim("npx", args) : spawn("npx", args);
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  fs.unlinkSync(ignoreFile);
  fs.rmdirSync(temporaryDir);
}

function spawnWindowsShim(command, args) {
  return spawn(process.env.ComSpec || "cmd.exe", [
    "/d",
    "/c",
    [command, ...args].map(quoteCmdArg).join(" "),
  ]);
}

function spawn(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ATLAS_PACKAGE_TARGET: target.name,
    },
  });
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
