import * as path from "node:path";

export function getAtlasNativeLaunch(
  extensionPath: string,
  executable: string,
  args: string[],
): { command: string; args: string[] } {
  if (process.platform !== "linux") {
    return { command: executable, args };
  }
  const launcher = require(path.join(extensionPath, "resources", "linux-runtime", "launch.cjs")) as {
    getNativeLaunch: (executable: string, args: string[]) => { command: string; args: string[] };
  };
  return launcher.getNativeLaunch(executable, args);
}
