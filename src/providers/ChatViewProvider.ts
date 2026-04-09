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
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "chat"),
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "api-keys"),
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "rag"),
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "library"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      await this._handleMessage(data, webviewView.webview);
    });
  }

  private async _handleMessage(data: any, webview: vscode.Webview) {
    const handledByApiKeyManager = await this.apiKeyManager.handleMessage(data, webview);

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
      return;
    }

    if (data.type === "salvarConfiguracoesSeguranca") {
      try {
        const updatedConfig = this.configManager.updateSecuritySettings(data.payload);
        await webview.postMessage({
          type: "configuracoesSegurancaSalvas",
          value: updatedConfig.cloudSecurity,
        });
        vscode.window.showInformationMessage("Configurações de segurança salvas.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        vscode.window.showErrorMessage(`Erro ao salvar configurações: ${message}`);
      }
      return;
    }

    if (data.type === "carregarConfiguracoesSeguranca") {
      try {
        const securitySettings = this.configManager.getSection("cloudSecurity");
        await webview.postMessage({
          type: "configuracoesSegurancaCarregadas",
          value: securitySettings,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        vscode.window.showErrorMessage(`Erro ao carregar configurações: ${message}`);
      }
      return;
    }

    if (data.type === "requestModels") {
      this._sendModelsToWebview(webview);
      return;
    }

    if (data.type === "saveModelParams") {
      try {
        const { modelId, params, customPrompt, systemPrompt } = data;
        const currentModel = this.configManager.getModel(modelId);
        
        if (currentModel) {
          this.configManager.updateModel(modelId, {
            parameters: {
              ...currentModel.parameters,
              gpuLayers: params.gpuLayers,
              temperature: params.temperature,
              contextWindow: params.contextWindow,
              maxTokens: params.maxTokens
            },
            custom: {
              ...currentModel.custom,
              tokensRes: params.tokensRes,
              systemPrompt: customPrompt ? systemPrompt : ""
            }
          });
          vscode.window.showInformationMessage("Parâmetros do modelo guardados com sucesso!");
          this._sendModelsToWebview(webview); 
        }
      } catch (error) {
        vscode.window.showErrorMessage("Erro ao guardar: " + error);
      }
      return;
    }
  }

  private _sendModelsToWebview(webview: vscode.Webview) {
    const rawModels = this.configManager.getAllModels();
    const modelsList = Object.values(rawModels).map(model => ({
      id: model.id,
      name: model.name || model.id,
      tag: model.metadata?.tags?.[0] || "LLM",
      quant: model.metadata?.quantization || "-",
      date: model.metadata?.installedAt ? new Date(model.metadata.installedAt).toLocaleDateString('pt-BR') : "-",
      file: model.path ? path.basename(model.path) : "-",
      size: model.metadata?.size || "-",
      params: {
        gpu: model.parameters?.gpuLayers ?? 40,
        tokensRes: model.custom?.tokensRes ?? 512,
        temp: model.parameters?.temperature ?? 0.7,
        context: model.parameters?.contextWindow ?? 4096,
        maxTokens: model.parameters?.maxTokens ?? 300
      },
      customPrompt: !!model.custom?.systemPrompt,
      systemPrompt: model.custom?.systemPrompt || ""
    }));

    webview.postMessage({
      type: "updateModelsList",
      models: modelsList
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview, selectedView?: string): string {
    if (!selectedView || selectedView === "chat") {
      selectedView = "chat";
    } else if (selectedView === "config") {
      selectedView = "api-keys";
    } else if (selectedView === "library") {
      selectedView = "library";
    }

    const webviewPath = path.join(this.context.extensionUri.fsPath, "src", "webview", selectedView);

    let htmlPath = "";
    if (selectedView === "api-keys") {
      htmlPath = path.join(webviewPath, "api-keys.html");
    } else if (selectedView === "rag") {
      htmlPath = path.join(webviewPath, "rag.html");
    } else if (selectedView === "library") {
      htmlPath = path.join(webviewPath, "library.html");
    } else {
      htmlPath = path.join(webviewPath, "chat.html");
    }

    const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, "styles.css")));
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, "script.js")));

    let markedUriStr = "";
    try {
      const markedUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(this.context.extensionUri.fsPath, "src", "webview", "chat", "vendor", "marked.min.js"))
      );
      markedUriStr = markedUri.toString();
    } catch (e) {}

    let html = fs.readFileSync(htmlPath, "utf8");

    html = html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{styleUri}}/g, styleUri.toString())
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{markedUri}}/g, markedUriStr);

    return html;
  }

  private _abrirPainelNoEditor(selectedView?: string) {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
      this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, selectedView);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      "atlasEditorPanel",
      "Configurações",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "chat"),
          vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "api-keys"),
          vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "rag"),
          vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "library"),
        ]
      },
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, selectedView);

    this._panel.webview.onDidReceiveMessage(async (data) => {
      await this._handleMessage(data, this._panel!.webview);
    });

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    void this.apiKeyManager.sendCredentialsToWebview(this._panel.webview);
  }
}