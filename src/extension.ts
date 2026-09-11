import * as vscode from "vscode";
import { ChatViewProvider } from "./providers/ChatViewProvider";
import { initializeAtlasRuntimeLog } from "./services/AtlasRuntimeLog";

export function activate(context: vscode.ExtensionContext) {
  initializeAtlasRuntimeLog(context);
  const provider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
  );

  const synchronizeSideBarLocation = () => {
    void provider.synchronizeSideBarLocation().catch((error) => {
      console.error("ATLAS: não foi possível sincronizar a posição.", error);
    });
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("workbench.sideBar.location")) {
        synchronizeSideBarLocation();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("atlas.baixarEngineAi", async () => {
      await provider.downloadEngineAI();
    }),
  );

  context.subscriptions.push({
    dispose: () => provider.dispose(),
  });
}
