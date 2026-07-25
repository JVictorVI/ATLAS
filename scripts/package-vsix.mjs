import { spawnSync } from "node:child_process";
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

const args = [
  "vsce",
  "package",
  "--target",
  target.name,
  "--out",
  target.vsixOut,
  "--ignore-other-target-folders",
];
const result =
  process.platform === "win32"
    ? spawnWindowsShim("npx", args)
    : spawn("npx", args);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function spawnWindowsShim(command, args) {
  return spawn(process.env.ComSpec || "cmd.exe", [
    "/d",
    "/c",
    [command, ...args].map(quoteCmdArg).join(" "),
  ]);
}

function spawn(command, args) {
  return spawnSync(command, args, {
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
