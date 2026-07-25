import * as path from "path";
import * as vscode from "vscode";

export function getAtlasStoragePath(
  context: vscode.ExtensionContext,
  ...segments: string[]
): string {
  return path.join(context.globalStorageUri.fsPath, ...segments);
}
