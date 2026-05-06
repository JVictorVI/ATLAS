import * as vscode from "vscode";
import * as path from "path";

import { ApiKeyManager } from "../managers/ApiKeyManager";
import { SecretStorageService } from "../services/SecretStorageService";
import { CloudApiService } from "../services/CloudApiService";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";

import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasSystemPromptPolicyService } from "../prompt/AtlasSystemPromptPolicyService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasPromptModeResolver } from "../prompt/AtlasPromptModeResolver";

import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";
import { AtlasConfigDefaults } from "../repository/AtlasConfigDefaults";
import { AtlasHistoryRepository } from "../repository/AtlasHistoryRepository";

import { AtlasQuickAnalysisService } from "../services/AtlasQuickAnalysisService";
import { AtlasSessionService } from "../services/AtlasSessionService";
import { AtlasEditorContextService } from "./AtlasEditorContextService";
import { AtlasQuickAnalysisController } from "./AtlasQuickAnalysisController";
import { ChatPanelManager } from "./ChatPanelManager";
import { ChatMessageRouter } from "./ChatMessageRouter";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "atlas-chat.view";

  private _view?: vscode.WebviewView;

  // Core services
  private readonly apiKeyManager: ApiKeyManager;
  private readonly configManager: AtlasConfigManager;
  private readonly cloudApiService: CloudApiService;

  // Prompt
  private readonly promptPolicyService: AtlasSystemPromptPolicyService;
  private readonly promptCustomizationService: AtlasPromptCustomizationService;
  private readonly promptAssemblyService: AtlasPromptAssemblyService;
  private readonly modeResolver: AtlasPromptModeResolver;

  // Config
  private readonly configRepository: AtlasConfigRepository;
  private readonly configDefaults: AtlasConfigDefaults;

  // History / Sessions
  private readonly historyRepository: AtlasHistoryRepository;
  private readonly sessionService: AtlasSessionService;

  // Editor & analysis
  private readonly editorContextService: AtlasEditorContextService;
  private readonly quickAnalysisService: AtlasQuickAnalysisService;
  private readonly quickAnalysisController: AtlasQuickAnalysisController;

  // UI orchestration
  private readonly panelManager: ChatPanelManager;
  private readonly messageRouter: ChatMessageRouter;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Secrets & config
    const secretStorage = new SecretStorageService(context);
    this.configManager = new AtlasConfigManager(context);
    this.configDefaults = new AtlasConfigDefaults();

    this.configRepository = new AtlasConfigRepository(
      context,
      this.configDefaults,
    );

    // History & sessions
    this.historyRepository = new AtlasHistoryRepository(context);

    // Prompt
    this.promptPolicyService = new AtlasSystemPromptPolicyService();
    this.modeResolver = new AtlasPromptModeResolver();

    this.promptCustomizationService = new AtlasPromptCustomizationService(
      this.configRepository,
    );

    this.promptAssemblyService = new AtlasPromptAssemblyService(
      this.promptPolicyService,
      this.promptCustomizationService,
      this.modeResolver,
    );

    // APIs
    this.apiKeyManager = new ApiKeyManager(secretStorage, this.configManager);

    this.cloudApiService = new CloudApiService(
      this.configManager,
      this.apiKeyManager,
    );

    // Session service (depends on cloudApiService for summarization)
    this.sessionService = new AtlasSessionService(
      this.historyRepository,
      this.cloudApiService,
    );

    // Editor context
    this.editorContextService = new AtlasEditorContextService();

    // Analysis
    this.quickAnalysisService = new AtlasQuickAnalysisService(
      this.promptAssemblyService,
      this.cloudApiService,
    );

    this.quickAnalysisController = new AtlasQuickAnalysisController(
      this.quickAnalysisService,
      this.editorContextService,
    );

    // UI / Panels
    this.panelManager = new ChatPanelManager(this.context, this.apiKeyManager);

    // Router
    this.messageRouter = new ChatMessageRouter({
      apiKeyManager: this.apiKeyManager,
      configManager: this.configManager,
      cloudApiService: this.cloudApiService,
      promptCustomizationService: this.promptCustomizationService,
      promptAssemblyService: this.promptAssemblyService,
      sessionService: this.sessionService,

      openPanel: (selectedView?: string) => {
        this.panelManager.openPanel(selectedView);
      },

      sendModelsToWebview: (webview: vscode.Webview) => {
        this._sendModelsToWebview(webview);
      },

      executeQuickAnalysis: async (webview?: vscode.Webview) => {
        await this.quickAnalysisController.execute(webview);
      },

      getChatEditorContext: () =>
        this.editorContextService.getChatEditorContext(),

      buildEditorAnalysisContext: (context) =>
        this.editorContextService.buildEditorAnalysisContext(context),
    });

    // Connect router → panel manager
    this.panelManager.setMessageHandler(async (data, webview) => {
      await this.messageRouter.handle(data, webview);
    });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: this.panelManager.getLocalResourceRoots(),
    };

    webviewView.webview.html = this.panelManager.setInitialHtml(
      webviewView.webview,
      "chat",
    );

    void this.sendAvailableLlmsToWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      await this.messageRouter.handle(data, webviewView.webview);
    });

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        return;
      }

      void this.sendAvailableLlmsToWebview(webviewView.webview);
    });
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

    webview.postMessage({ type: "updateModelsList", models: modelsList });
  }

  private async sendAvailableLlmsToWebview(
    webview: vscode.Webview,
  ): Promise<void> {
    const providers = this.configManager.getAllProviders();
    const localModels = this.configManager.getLocalModels();

    await webview.postMessage({
      type: "informarLLMsCarregados",
      value: {
        studyModeEnabled: this.configManager.isStudyModeEnabled(),
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
  }

  public async runQuickAnalysisFromCommand(): Promise<void> {
    await this.quickAnalysisController.execute(this._view?.webview);
  }

  public dispose(): void {
    this.quickAnalysisController.dispose();
  }
}
