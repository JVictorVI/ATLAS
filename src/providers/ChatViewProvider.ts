import * as vscode from "vscode";
import * as path from "path";

import { ApiKeyManager } from "../managers/ApiKeyManager";
import { SecretStorageService } from "../services/SecretStorageService";
import { CloudApiService } from "../services/CloudApiService";
import { LocalApiService } from "../services/LocalApiService";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import { AtlasLocalModelDiscoveryService } from "../services/AtlasLocalModelDiscoveryService";
import { AtlasLocalEngineService } from "../services/AtlasLocalEngineService";
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
  private readonly localApiService: LocalApiService;
  private readonly inferenceService: AtlasInferenceService;
  private readonly localModelDiscoveryService: AtlasLocalModelDiscoveryService;
  private readonly localEngineService: AtlasLocalEngineService;

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
  private startupEnginePromise: Promise<void> | null = null;
  private notifyEngineStartup = false;

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

    this.localModelDiscoveryService = new AtlasLocalModelDiscoveryService(
      this.context,
      this.configManager,
    );

    this.localEngineService = new AtlasLocalEngineService(
      this.context,
      this.configManager,
    );
    this.localEngineService.onStatus(async (message) => {
      await this._view?.webview.postMessage({
        type: "engineLocalStatus",
        value: { message },
      });

      if (this.notifyEngineStartup) {
        vscode.window.showInformationMessage(`ATLAS: ${message}`);
      }
    });

    this.localApiService = new LocalApiService(
      this.configManager,
      this.localEngineService,
    );

    this.inferenceService = new AtlasInferenceService(
      this.configManager,
      this.cloudApiService,
      this.localApiService,
    );

    // Session service (depends on inference service for summarization)
    this.sessionService = new AtlasSessionService(
      this.historyRepository,
      this.inferenceService,
    );

    // Editor context
    this.editorContextService = new AtlasEditorContextService();

    // Analysis
    this.quickAnalysisService = new AtlasQuickAnalysisService(
      this.promptAssemblyService,
      this.inferenceService,
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
      inferenceService: this.inferenceService,
      promptCustomizationService: this.promptCustomizationService,
      promptAssemblyService: this.promptAssemblyService,
      sessionService: this.sessionService,

      openPanel: (selectedView?: string) => {
        this.panelManager.openPanel(selectedView);
      },

      openSearchModelDetails: (modelId: string) => {
        this.panelManager.openSearchModelDetails(modelId);
      },

      sendModelsToWebview: (webview: vscode.Webview) => {
        this._sendModelsToWebview(webview);
      },

      executeQuickAnalysis: async (webview?: vscode.Webview) => {
        await this.quickAnalysisController.execute(webview);
      },

      refreshLocalModels: () => {
        return this.localModelDiscoveryService.refreshLocalModels();
      },

      promptStopLocalEngine: async () => {
        await this.promptStopLocalEngine();
      },

      stopLocalEngine: () => {
        this.localEngineService.stopEngine();
      },

      getLocalModelsDir: () => this.localModelDiscoveryService.getModelsDir(),

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
    void this.startEngineOnAtlasOpenIfEnabled();

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
    const localModels = this.localModelDiscoveryService.refreshLocalModels();

    const modelsList = localModels.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      provider: model.provider || "Local",
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
    const localModels = this.localModelDiscoveryService.refreshLocalModels();

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
          provider: model.provider || "Local",
        })),
      },
    });
  }

  private async startEngineOnAtlasOpenIfEnabled(): Promise<void> {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (
      typeof localEngine !== "object" ||
      localEngine === null ||
      (localEngine as Record<string, unknown>).startOnAtlasOpen !== true
    ) {
      return;
    }

    if (this.startupEnginePromise) {
      return this.startupEnginePromise;
    }

    this.startupEnginePromise = this.startEngineOnAtlasOpen();

    try {
      await this.startupEnginePromise;
    } finally {
      this.startupEnginePromise = null;
    }
  }

  private async startEngineOnAtlasOpen(): Promise<void> {
    this.localModelDiscoveryService.refreshLocalModels();
    const model = this.configManager.getActiveLocalModel();

    if (!model) {
      vscode.window.showWarningMessage(
        "ATLAS: engine local não iniciada automaticamente porque nenhum modelo local está selecionado.",
      );
      return;
    }

    this.notifyEngineStartup = true;

    try {
      vscode.window.showInformationMessage(
        `ATLAS: iniciando a engine local para ${model.name}.`,
      );
      await this.localEngineService.ensureEngine(model);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao iniciar engine local.";

      vscode.window.showErrorMessage(`ATLAS: ${message}`);
    } finally {
      this.notifyEngineStartup = false;
    }
  }

  public dispose(): void {
    this.localEngineService.stopEngine();
    this.quickAnalysisController.dispose();
  }

  private async promptStopLocalEngine(): Promise<void> {
    if (!this.localEngineService.isRunning()) {
      return;
    }

    const answer = await vscode.window.showInformationMessage(
      "A engine local do ATLAS continua em execução ao fundo. Deseja pará-lo para economizar recursos?",
      "Parar engine local",
      "Manter executando",
    );

    if (answer === "Parar engine local") {
      this.localEngineService.stopEngine();
      vscode.window.showInformationMessage("Engine local do ATLAS encerrado.");
    }
  }
}
