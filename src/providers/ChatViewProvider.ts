import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ApiKeyManager } from "../managers/ApiKeyManager";
import { SecretStorageService } from "../services/SecretStorageService";
import { AtlasConfigManager } from "../services/AtlasConfigManager";
import { ChatMessage, CloudApiService } from "../services/CloudApiService";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "atlas-chat.view";
  private _view?: vscode.WebviewView;
  private _panel?: vscode.WebviewPanel;
  private readonly apiKeyManager: ApiKeyManager;
  private readonly configManager: AtlasConfigManager;
  private readonly cloudApiService: CloudApiService;

  constructor(private readonly context: vscode.ExtensionContext) {
    const secretStorage = new SecretStorageService(context);
    this.configManager = new AtlasConfigManager(context);
    this.apiKeyManager = new ApiKeyManager(secretStorage, this.configManager);
    this.cloudApiService = new CloudApiService(
      this.configManager,
      this.apiKeyManager,
    );
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "src",
          "webview",
          "chat",
        ),
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "src",
          "webview",
          "api-keys",
        ),
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "rag"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      await this._handleMessage(data, webviewView.webview);
    });
  }

  private async _handleMessage(data: any, webview: vscode.Webview) {
    const handledByApiKeyManager = await this.apiKeyManager.handleMessage(
      data,
      webview,
    );

    if (handledByApiKeyManager) {
      return;
    }

    if (data.type === "enviarPergunta") {
      await webview.postMessage({
        type: "novaResposta",
        value: `Você disse: ${data.value}`,
      });

      if (data.value.toLowerCase().includes("modelos")) {
        const response =
          await this.cloudApiService.getModelsForCurrentProvider();

        const modelos = response.map((model) => model.id).join("\n");

        await webview.postMessage({
          type: "novaResposta",
          value: modelos,
        });
      } else {
        const chatMessage: ChatMessage[] = [
          { role: "user", content: data.value },
        ];
        const response = await this.cloudApiService.sendChat(chatMessage);
        await webview.postMessage({
          type: "novaResposta",
          value: response,
        });
      }

      return;
    }

    if (data.type === "abrirPainelConfig") {
      this._abrirPainelNoEditor(data.selectedView);
    }

    if (data.type === "salvarConfiguracoesSeguranca") {
      try {
        const updatedConfig = this.configManager.updateSecuritySettings(
          data.payload,
        );

        await webview.postMessage({
          type: "configuracoesSegurancaSalvas",
          value: updatedConfig.cloudSecurity,
        });

        vscode.window.showInformationMessage(
          "Configurações de segurança salvas.",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        vscode.window.showErrorMessage(
          `Erro ao salvar configurações: ${message}`,
        );
      }
    }

    if (data.type === "carregarConfiguracoesSeguranca") {
      try {
        const securitySettings = this.configManager.getSection("cloudSecurity");

        await webview.postMessage({
          type: "configuracoesSegurancaCarregadas",
          value: securitySettings,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        vscode.window.showErrorMessage(
          `Erro ao carregar configurações: ${message}`,
        );
      }
    }
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    selectedView?: string,
  ): string {
    selectedView = selectedView === "config" ? "api-keys" : "chat";

    const webviewPath = path.join(
      this.context.extensionUri.fsPath,
      "src",
      "webview",
      selectedView,
    );

    let htmlPath = "";

    if (selectedView === "config" || selectedView === "api-keys") {
      htmlPath = path.join(webviewPath, "api-keys.html");
    } else if (selectedView === "rag") {
      htmlPath = path.join(webviewPath, "rag.html");
    } else {
      htmlPath = path.join(webviewPath, "chat.html");
    }

    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "styles.css")),
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "script.js")),
    );

    const markedUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "vendor", "marked.min.js")),
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    html = html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{styleUri}}/g, styleUri.toString())
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{markedUri}}/g, markedUri.toString());

    return html;
  }

  private _abrirPainelNoEditor(selectedView?: string) {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);

      this._panel.webview.html = this._getHtmlForWebview(
        this._panel.webview,
        selectedView,
      );

      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      "atlasEditorPanel",
      "Configurações",

      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this._panel.webview.html = this._getHtmlForWebview(
      this._panel.webview,
      selectedView,
    );

    this._panel.webview.onDidReceiveMessage(async (data) => {
      await this._handleMessage(data, this._panel!.webview);
    });

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    void this.apiKeyManager.sendCredentialsToWebview(this._panel.webview);
  }
}
