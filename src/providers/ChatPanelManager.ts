import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ApiKeyManager } from "../managers/ApiKeyManager";

type AtlasPanelGroup = "chat" | "config" | "library" | "search";

type MessageHandler = (
  data: unknown,
  webview: vscode.Webview,
) => Promise<void> | void;

export class ChatPanelManager {
  private chatPanel?: vscode.WebviewPanel;
  private configPanel?: vscode.WebviewPanel;
  private libraryPanel?: vscode.WebviewPanel;
  private searchPanel?: vscode.WebviewPanel;
  private onMessage?: MessageHandler;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiKeyManager: ApiKeyManager,
  ) {}

  public setMessageHandler(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  public getLocalResourceRoots(): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "chat"),
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "src",
        "webview",
        "api-keys",
      ),
      vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "rag"),
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "src",
        "webview",
        "search",
      ),
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "src",
        "webview",
        "library",
      ),
    ];
  }

  public setInitialHtml(
    webview: vscode.Webview,
    selectedView?: string,
  ): string {
    return this.getHtmlForWebview(webview, selectedView);
  }

  public openPanel(selectedView?: string): void {
    const normalizedView = this.normalizeSelectedView(selectedView);
    const panelGroup = this.getPanelGroup(normalizedView);
    const panelTitle = this.getPanelTitle(normalizedView);

    const existingPanel = this.getPanelByGroup(panelGroup);

    if (existingPanel) {
      existingPanel.title = panelTitle;
      existingPanel.reveal(vscode.ViewColumn.One);
      existingPanel.webview.html = this.getHtmlForWebview(
        existingPanel.webview,
        normalizedView,
      );
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      `atlasEditorPanel.${panelGroup}`,
      panelTitle,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.getLocalResourceRoots(),
      },
    );

    panel.webview.html = this.getHtmlForWebview(panel.webview, normalizedView);

    panel.webview.onDidReceiveMessage(async (data) => {
      await this.onMessage?.(data, panel.webview);
    });

    panel.onDidDispose(() => {
      this.clearPanelReference(panelGroup);
    });

    this.setPanelByGroup(panelGroup, panel);

    void this.apiKeyManager.sendCredentialsToWebview(panel.webview);
  }

  public openSearchModelDetails(modelId: string): void {
    this.openPanel("search");

    setTimeout(() => {
      void this.searchPanel?.webview.postMessage({
        type: "mostrarDetalhesModelo",
        modelId,
      });
    }, 50);
  }

  public normalizeSelectedView(selectedView?: string): string {
    if (!selectedView || selectedView === "chat") {
      return "chat";
    }

    if (selectedView === "config" || selectedView === "api-keys") {
      return "api-keys";
    }

    if (selectedView === "rag") {
      return "rag";
    }

    if (selectedView === "search") {
      return "search";
    }

    if (selectedView === "library") {
      return "library";
    }

    return "chat";
  }

  public getPanelGroup(selectedView?: string): AtlasPanelGroup {
    const normalizedView = this.normalizeSelectedView(selectedView);

    if (normalizedView === "api-keys" || normalizedView === "rag") {
      return "config";
    }

    if (normalizedView === "library") {
      return "library";
    }

    if (normalizedView === "search") {
      return "search";
    }

    return "chat";
  }

  public getPanelTitle(selectedView?: string): string {
    const normalizedView = this.normalizeSelectedView(selectedView);

    if (normalizedView === "api-keys" || normalizedView === "rag") {
      return "Configurações";
    }

    if (normalizedView === "library") {
      return "Biblioteca";
    }

    if (normalizedView === "search") {
      return "Pesquisa de Modelos";
    }

    return "Chat";
  }

  public getHtmlForWebview(
    webview: vscode.Webview,
    selectedView?: string,
  ): string {
    const normalizedView = this.normalizeSelectedView(selectedView);

    const webviewPath = path.join(
      this.context.extensionUri.fsPath,
      "src",
      "webview",
      normalizedView,
    );

    const htmlPath = this.resolveHtmlPath(webviewPath, normalizedView);

    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "styles.css")),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "script.js")),
    );

    const markedUri = this.tryGetMarkedUri(webview);
    let html = fs.readFileSync(htmlPath, "utf8");

    html = html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{styleUri}}/g, styleUri.toString())
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{markedUri}}/g, markedUri);

    return html;
  }

  private resolveHtmlPath(webviewPath: string, selectedView: string): string {
    if (selectedView === "api-keys") {
      return path.join(webviewPath, "api-keys.html");
    }

    if (selectedView === "search") {
      return path.join(webviewPath, "search.html");
    }

    if (selectedView === "rag") {
      return path.join(webviewPath, "rag.html");
    }

    if (selectedView === "library") {
      return path.join(webviewPath, "library.html");
    }

    return path.join(webviewPath, "chat.html");
  }

  private tryGetMarkedUri(webview: vscode.Webview): string {
    try {
      return webview
        .asWebviewUri(
          vscode.Uri.file(
            path.join(
              this.context.extensionUri.fsPath,
              "src",
              "webview",
              "chat",
              "vendor",
              "marked.min.js",
            ),
          ),
        )
        .toString();
    } catch {
      return "";
    }
  }

  private getPanelByGroup(
    group: AtlasPanelGroup,
  ): vscode.WebviewPanel | undefined {
    if (group === "chat") {
      return this.chatPanel;
    }

    if (group === "config") {
      return this.configPanel;
    }

    if (group === "search") {
      return this.searchPanel;
    }

    return this.libraryPanel;
  }

  private setPanelByGroup(
    group: AtlasPanelGroup,
    panel: vscode.WebviewPanel,
  ): void {
    if (group === "chat") {
      this.chatPanel = panel;
      return;
    }

    if (group === "config") {
      this.configPanel = panel;
      return;
    }

    if (group === "search") {
      this.searchPanel = panel;
      return;
    }

    this.libraryPanel = panel;
  }

  private clearPanelReference(group: AtlasPanelGroup): void {
    if (group === "chat") {
      this.chatPanel = undefined;
      return;
    }

    if (group === "config") {
      this.configPanel = undefined;
      return;
    }

    if (group === "search") {
      this.searchPanel = undefined;
      return;
    }

    this.libraryPanel = undefined;
  }
}
