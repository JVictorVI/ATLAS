import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ApiKeyManager } from "../managers/ApiKeyManager";
import { SecretStorageService } from "../services/SecretStorageService";
import { CloudApiService } from "../services/CloudApiService";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasSystemPromptPolicyService } from "../prompt/AtlasSystemPromptPolicyService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";
import { AtlasConfigDefaults } from "../repository/AtlasConfigDefaults";
import { AtlasPromptModeResolver } from "../prompt/AtlasPromptModeResolver";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "atlas-chat.view";
  private _view?: vscode.WebviewView;
  private _chatPanel?: vscode.WebviewPanel;
  private _configPanel?: vscode.WebviewPanel;
  private _libraryPanel?: vscode.WebviewPanel;
  private readonly apiKeyManager: ApiKeyManager;
  private readonly configManager: AtlasConfigManager;
  private readonly cloudApiService: CloudApiService;
  private readonly promptPolicyService: AtlasSystemPromptPolicyService;
  private readonly promptCustomizationService: AtlasPromptCustomizationService;
  private readonly promptAssemblyService: AtlasPromptAssemblyService;
  private readonly configRepository: AtlasConfigRepository;
  private readonly configDefaults: AtlasConfigDefaults;
  private readonly modeResolver: AtlasPromptModeResolver;

  constructor(private readonly context: vscode.ExtensionContext) {
    const secretStorage = new SecretStorageService(context);
    this.configManager = new AtlasConfigManager(context);
    this.promptPolicyService = new AtlasSystemPromptPolicyService();
    this.configDefaults = new AtlasConfigDefaults();
    this.modeResolver = new AtlasPromptModeResolver();
    this.configRepository = new AtlasConfigRepository(
      context,
      this.configDefaults,
    );
    this.promptCustomizationService = new AtlasPromptCustomizationService(
      this.configRepository,
    );
    this.promptAssemblyService = new AtlasPromptAssemblyService(
      this.promptPolicyService,
      this.promptCustomizationService,
      this.modeResolver,
    );
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
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "src",
          "webview",
          "library",
        ),
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

    if (data.type === "carregarLLMs") {
      try {
        const providers = this.configManager.getAllProviders();
        const localModels = this.configManager.getLocalModels();
        const selectedProviderId =
          this.configManager.getSelectedCloudProviderId() ??
          providers[0]?.id ??
          null;

        await webview.postMessage({
          type: "informarLLMsCarregados",
          value: {
            selectedMode: this.configManager.getCurrentMode(),
            selectedProviderId: this.configManager.getSelectedCloudProviderId(),
            selectedCloudModelId: this.configManager.getSelectedCloudModelId(),
            selectedLocalModelId:
              this.configManager.getActiveLocalModel()?.id ?? null,
            providers: providers.map((provider) => ({
              id: provider.id,
              name: provider.label,
              type: "cloud",
              models: [],
            })),
            localModels: localModels.map((model) => ({
              id: model.id,
              name: model.name || model.id,
            })),
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao carregar LLMs.";

        await webview.postMessage({
          type: "erro",
          value: message,
        });
      }

      return;
    }

    if (data.type === "enviarPergunta") {
      const promptResult = this.promptAssemblyService.buildMessages({
        userQuestion: data.value,
        history: [],
        analysisContext: [],
        ragContext: [],
        hasCodeContext: false,
      });

      const response = await this.cloudApiService.sendChat(
        promptResult.messages,
      );

      await webview.postMessage({
        type: "novaResposta",
        value: response.content,
        metadata: {
          mode: promptResult.mode,
          providerId: response.providerId,
          providerKind: response.providerKind,
          modelId: response.modelId,
          finishReason: response.finishReason,
          usage: response.usage,
          createdAt: response.createdAt,
        },
      });

      return;
    }

    if (data.type === "abrirPainelConfig") {
      this._abrirPainelNoEditor(data.selectedView);
      return;
    }

    if (data.type === "selecionarModo") {
      try {
        this.configManager.setMode(data.mode);

        await webview.postMessage({
          type: "modoSelecionado",
          value: {
            mode: data.mode,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao selecionar modo.";

        await webview.postMessage({
          type: "erro",
          value: message,
        });
      }

      return;
    }

    if (data.type === "salvarConfiguracoesSeguranca") {
      try {
        const {
          confirmCloud,
          blockRag,
          limitPayload,
          maxTokens,
          timeout,
          temperature,
          topP,
        } = data.payload ?? {};

        this.configManager.updateSecuritySettings({
          confirmCloud,
          blockRag,
          limitPayload,
          maxTokens,
          timeout,
        });

        this.configManager.updateLlmDefaults({
          temperature,
          topP,
          maxTokens,
        });

        const securitySettings = this.configManager.getSection("cloudSecurity");
        const llmDefaults = this.configManager.getConfig().llms.defaults;

        await webview.postMessage({
          type: "configuracoesSegurancaSalvas",
          value: {
            ...securitySettings,
            temperature: llmDefaults.temperature,
            topP: llmDefaults.topP,
          },
        });

        vscode.window.showInformationMessage(
          "Configurações de execução salvas.",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";

        await webview.postMessage({
          type: "erro",
          value: message,
        });

        vscode.window.showErrorMessage(
          `Erro ao salvar configurações: ${message}`,
        );
      }

      return;
    }

    if (data.type === "carregarConfiguracoesSeguranca") {
      try {
        const securitySettings = this.configManager.getSection("cloudSecurity");
        const llmDefaults = this.configManager.getConfig().llms.defaults;

        await webview.postMessage({
          type: "configuracoesSegurancaCarregadas",
          value: {
            ...securitySettings,
            temperature: llmDefaults.temperature,
            topP: llmDefaults.topP,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";

        await webview.postMessage({
          type: "erro",
          value: message,
        });

        vscode.window.showErrorMessage(
          `Erro ao carregar configurações: ${message}`,
        );
      }

      return;
    }

    if (data.type === "selecionarModelo") {
      try {
        if (data.mode === "local") {
          this.configManager.setActiveLocalModel(data.modelId);
        } else if (data.mode === "cloud") {
          this.configManager.setActiveCloudModel(data.modelId);
        }

        await webview.postMessage({
          type: "modeloSelecionado",
          value: {
            mode: data.mode,
            modelId: data.modelId,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao selecionar modelo.";

        await webview.postMessage({
          type: "erro",
          value: message,
        });
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
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        vscode.window.showErrorMessage(
          `Erro ao carregar configurações: ${message}`,
        );
      }
      return;
    }

    if (data.type === "carregarComportamentoModelo") {
      try {
        const behavior = this.promptCustomizationService.getBehaviorConfig();

        await webview.postMessage({
          type: "comportamentoModeloCarregado",
          value: behavior,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Erro ao carregar comportamento do modelo.";

        await webview.postMessage({
          type: "erro",
          value: message,
        });
      }

      return;
    }

    if (data.type === "salvarComportamentoModelo") {
      try {
        const saved = this.promptCustomizationService.saveBehaviorConfig(
          data.payload,
        );

        await webview.postMessage({
          type: "comportamentoModeloSalvo",
          value: saved,
        });

        vscode.window.showInformationMessage(
          "Comportamento do modelo salvo com sucesso.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Erro ao salvar comportamento do modelo.";

        await webview.postMessage({
          type: "erro",
          value: message,
        });

        vscode.window.showErrorMessage(message);
      }

      return;
    }

    if (data.type === "requestModels") {
      this._sendModelsToWebview(webview);
      return;
    }
  }

  private _sendModelsToWebview(webview: vscode.Webview) {
    const rawModels = this.configManager.getAllModels();
    const modelsList = Object.values(rawModels).map((model) => ({
      id: model.id,
      name: model.name || model.id,
      tag: model.metadata?.tags?.[0] || "LLM",
      quant: model.metadata?.quantization || "-",
      date: model.metadata?.installedAt
        ? new Date(model.metadata.installedAt).toLocaleDateString("pt-BR")
        : "-",
      file: model.path ? path.basename(model.path) : "-",
      size: model.metadata?.size || "-",
      params: {
        gpu: model.parameters?.gpuLayers ?? 40,
        tokensRes: model.custom?.tokensRes ?? 512,
        temp: model.parameters?.temperature ?? 0.7,
        context: model.parameters?.contextWindow ?? 4096,
        maxTokens: model.parameters?.maxTokens ?? 300,
      },
      customPrompt: !!model.custom?.systemPrompt,
      systemPrompt: model.custom?.systemPrompt || "",
    }));

    webview.postMessage({
      type: "updateModelsList",
      models: modelsList,
    });
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    selectedView?: string,
  ): string {
    if (!selectedView || selectedView === "chat") {
      selectedView = "chat";
    } else if (selectedView === "config") {
      selectedView = "api-keys";
    } else if (selectedView === "library") {
      selectedView = "library";
    }

    const webviewPath = path.join(
      this.context.extensionUri.fsPath,
      "src",
      "webview",
      selectedView,
    );

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

    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "styles.css")),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, "script.js")),
    );

    let markedUriStr = "";
    try {
      const markedUri = webview.asWebviewUri(
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
    const normalizedView = this._normalizeSelectedView(selectedView);
    const panelGroup = this._getPanelGroup(normalizedView);
    const panelTitle = this._getPanelTitle(normalizedView);

    let targetPanel: vscode.WebviewPanel | undefined;

    if (panelGroup === "chat") {
      targetPanel = this._chatPanel;
    } else if (panelGroup === "config") {
      targetPanel = this._configPanel;
    } else if (panelGroup === "library") {
      targetPanel = this._libraryPanel;
    }

    if (targetPanel) {
      targetPanel.title = panelTitle;
      targetPanel.reveal(vscode.ViewColumn.One);
      targetPanel.webview.html = this._getHtmlForWebview(
        targetPanel.webview,
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
          vscode.Uri.joinPath(
            this.context.extensionUri,
            "src",
            "webview",
            "rag",
          ),
          vscode.Uri.joinPath(
            this.context.extensionUri,
            "src",
            "webview",
            "library",
          ),
        ],
      },
    );

    panel.webview.html = this._getHtmlForWebview(panel.webview, normalizedView);

    panel.webview.onDidReceiveMessage(async (data) => {
      await this._handleMessage(data, panel.webview);
    });

    panel.onDidDispose(() => {
      if (panelGroup === "chat") {
        this._chatPanel = undefined;
      } else if (panelGroup === "config") {
        this._configPanel = undefined;
      } else if (panelGroup === "library") {
        this._libraryPanel = undefined;
      }
    });

    if (panelGroup === "chat") {
      this._chatPanel = panel;
    } else if (panelGroup === "config") {
      this._configPanel = panel;
    } else if (panelGroup === "library") {
      this._libraryPanel = panel;
    }

    void this.apiKeyManager.sendCredentialsToWebview(panel.webview);
  }

  private _normalizeSelectedView(selectedView?: string): string {
    if (!selectedView || selectedView === "chat") {
      return "chat";
    }

    if (selectedView === "config") {
      return "api-keys";
    }

    if (selectedView === "rag") {
      return "rag";
    }

    if (selectedView === "library") {
      return "library";
    }

    return "chat";
  }

  private _getPanelGroup(selectedView?: string): "chat" | "config" | "library" {
    const normalizedView = this._normalizeSelectedView(selectedView);

    if (normalizedView === "api-keys" || normalizedView === "rag") {
      return "config";
    }

    if (normalizedView === "library") {
      return "library";
    }

    return "chat";
  }

  private _getPanelTitle(selectedView?: string): string {
    if (
      selectedView === "rag" ||
      selectedView === "api-keys" ||
      selectedView === "config"
    ) {
      return "Configurações";
    }

    if (selectedView === "library") {
      return "Biblioteca";
    }

    return "Chat";
  }
}
