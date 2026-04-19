import * as vscode from "vscode";
import { ChatViewProvider } from "./providers/ChatViewProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      provider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("atlas.quickAnalysis", async () => {
      await provider.runQuickAnalysisFromCommand();
    }),
  );

  context.subscriptions.push({
    dispose: () => provider.dispose(),
  });
}
