import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;
const reportedErrors = new WeakSet<Error>();

export function initializeAtlasRuntimeLog(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("ATLAS");
  context.subscriptions.push(channel, {
    dispose: () => { channel = undefined; },
  });
  context.subscriptions.push(vscode.commands.registerCommand("atlas.mostrarLogs", () => {
    channel?.show(true);
  }));
}

export function logAtlasRuntimeError(service: string, error: Error): void {
  if (!channel || reportedErrors.has(error)) {
    return;
  }
  reportedErrors.add(error);
  channel.appendLine(`[${new Date().toISOString()}] [${service}] ${error.message}`);
}
