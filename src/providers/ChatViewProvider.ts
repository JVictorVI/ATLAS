import * as vscode from "vscode";

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
import { AtlasDocumentStructureService } from "../services/AtlasDocumentStructureService";
import { AtlasSessionService } from "../services/AtlasSessionService";
import { AtlasChromaService } from "../services/AtlasChromaService";
import { AtlasRagService } from "../services/AtlasRagService";
import { AtlasEmbeddingService } from "../services/AtlasEmbeddingService";
import { AtlasEmbeddingModelDiscoveryService } from "../services/AtlasEmbeddingModelDiscoveryService";
import { AtlasRagRepository } from "../repository/AtlasRagRepository";
import { AtlasEditorContextService } from "./AtlasEditorContextService";
import { AtlasQuickAnalysisController } from "./AtlasQuickAnalysisController";
import { ChatPanelManager } from "./ChatPanelManager";
import { ChatMessageRouter } from "./ChatMessageRouter";
import { ChatModelWebviewService } from "./ChatModelWebviewService";

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
  private readonly documentStructureService: AtlasDocumentStructureService;
  private readonly quickAnalysisService: AtlasQuickAnalysisService;
  private readonly quickAnalysisController: AtlasQuickAnalysisController;
  private readonly chromaService: AtlasChromaService;
  private readonly embeddingModelDiscoveryService: AtlasEmbeddingModelDiscoveryService;
  private readonly embeddingService: AtlasEmbeddingService;
  private readonly ragRepository: AtlasRagRepository;
  private readonly ragService: AtlasRagService;

  // UI orchestration
  private readonly panelManager: ChatPanelManager;
  private readonly modelWebviewService: ChatModelWebviewService;
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
    this.promptPolicyService = new AtlasSystemPromptPolicyService(
      this.configRepository,
    );
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
    this.documentStructureService = new AtlasDocumentStructureService();
    this.chromaService = new AtlasChromaService(this.context);
    this.embeddingModelDiscoveryService =
      new AtlasEmbeddingModelDiscoveryService(
        this.context,
        this.configManager,
      );
    this.embeddingService = new AtlasEmbeddingService(
      this.context,
      this.configManager,
      this.embeddingModelDiscoveryService,
    );
    this.ragRepository = new AtlasRagRepository(
      this.context,
      this.chromaService,
    );
    this.ragService = new AtlasRagService(
      this.configManager,
      this.chromaService,
      this.embeddingService,
      this.ragRepository,
    );

    // Analysis
    this.quickAnalysisService = new AtlasQuickAnalysisService(
      this.promptAssemblyService,
      this.inferenceService,
      this.documentStructureService,
      this.configManager,
    );

    // UI / Panels
    this.panelManager = new ChatPanelManager(this.context, this.apiKeyManager);
    this.ragService.onProjectsChanged((projects) => {
      this.panelManager.postMessage({
        type: "projetosRagAtualizados",
        value: { projects },
      });
    });

    this.quickAnalysisController = new AtlasQuickAnalysisController(
      this.quickAnalysisService,
      this.editorContextService,
      (available, hasEditorContext) => {
        this.broadcastQuickAnalysisAvailability(available, hasEditorContext);
      },
    );

    this.modelWebviewService = new ChatModelWebviewService(
      this.localModelDiscoveryService,
      this.configManager,
      () => this.localEngineService.isRunning(),
    );

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
        this.modelWebviewService.sendModelsToWebview(webview);
      },

      executeQuickAnalysis: async (
        webview?: vscode.Webview,
        options?: {
          source?: "button" | "chat";
          sessionId?: string;
          signal?: AbortSignal;
        },
      ) => {
        await this.quickAnalysisController.execute(webview, options);
      },

      cancelQuickAnalysis: () => {
        this.quickAnalysisController.cancelActiveAnalysis();
      },

      clearQuickAnalysisDecorations: () => {
        this.quickAnalysisController.clearActiveDecorations();
      },

      sendQuickAnalysisAvailability: async (webview: vscode.Webview) => {
        const activeAnalysis = this.quickAnalysisController.getActiveAnalysis();

        await webview.postMessage({
          type: "disponibilidadeMarcacoesAnaliseRapida",
          value: {
            available: this.quickAnalysisController.hasActiveDecorations(),
            hasEditorContext:
              this.quickAnalysisController.hasAnalyzableEditor(),
          },
        });

        if (activeAnalysis) {
          await webview.postMessage({
            type: "analiseRapidaStatus",
            sessionId: activeAnalysis.sessionId,
            value: {
              loading: true,
              source: activeAnalysis.source,
            },
          });
        }
      },

      refreshLocalModels: () => {
        return this.localModelDiscoveryService.refreshLocalModels();
      },

      startLocalEngine: async () => {
        await this.startLocalEngineForActiveModel();
      },

      promptStopLocalEngine: async () => {
        await this.promptStopLocalEngine();
      },

      stopLocalEngine: (options?: { force?: boolean }) => {
        this.localEngineService.stopEngine(options);
        this.broadcastEngineControlStatus({
          loading: false,
          running: false,
          message: options?.force
            ? "Geracao local interrompida. Engine parada."
            : "Engine parada.",
        });
      },

      getLocalModelsDir: () => this.localModelDiscoveryService.getModelsDir(),

      getLocalEnginesDir: () => this.localEngineService.getEnginesDir(),

      refreshRagEmbeddingModels: () => {
        return this.embeddingModelDiscoveryService.refreshEmbeddingModels();
      },

      getRagEmbeddingModelsDir: () => {
        return this.embeddingModelDiscoveryService.getModelsDir();
      },

      downloadDefaultRagEmbeddingModel: (onProgress, signal) => {
        return this.embeddingModelDiscoveryService.downloadDefaultEmbeddingModel(
          onProgress,
          signal,
        );
      },

      getChatEditorContext: () =>
        this.editorContextService.getChatEditorContext(),

      buildEditorAnalysisContext: (context) =>
        this.editorContextService.buildEditorAnalysisContext(context),

      buildDocumentStructureContext: async (document) => {
        const structure = await this.documentStructureService.collect(document);
        const summaries = [
          this.documentStructureService.buildSummary(structure),
        ];

        if (this.configManager.getStaticAnalysisConfig().includeDiagnostics) {
          summaries.push(
            this.documentStructureService.buildDiagnosticsSummary(document),
          );
        }

        if (
          this.configManager.getStaticAnalysisConfig().includeSymbolRelations
        ) {
          summaries.push(
            await this.documentStructureService.buildSymbolRelationsSummary(
              document,
            ),
          );
        }

        const summary = summaries.join("\n\n");

        console.log(
          "[ATLAS] Análise estática gerada (análise arquitetural):\n",
          summary,
        );

        return summary;
      },

      isChatViewVisible: () => this._view?.visible === true,

      focusChatView: async () => {
        await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
      },

      initializeRag: async () => {
        return this.ragService.initialize();
      },

      getRagRuntimeStatus: () => {
        return this.ragService.getRuntimeStatus();
      },

      stopRag: () => {
        this.ragService.dispose();
      },

      listRagProjects: () => {
        return this.ragService.listProjects();
      },

      listExternalRagDocuments: () => {
        return this.ragService.listExternalDocuments();
      },

      addExternalRagDocuments: async (uris, onProgress, signal) => {
        return this.ragService.addExternalDocuments(uris, onProgress, signal);
      },

      deleteExternalRagDocument: async (sourceId) => {
        return this.ragService.deleteExternalDocument(sourceId);
      },

      clearExternalRagDocuments: async () => {
        return this.ragService.deleteAllExternalDocuments();
      },

      indexCurrentWorkspace: async (onProgress, signal, options) => {
        return this.ragService.indexCurrentWorkspace(
          onProgress,
          signal,
          options,
        );
      },

      indexSelectedFolder: async (folderUri, onProgress, signal, options) => {
        return this.ragService.indexSelectedFolder(
          folderUri,
          onProgress,
          signal,
          options,
        );
      },

      registerSelectedFolder: (folderUri) => {
        return this.ragService.registerSelectedFolder(folderUri);
      },

      indexRagProject: async (projectId, onProgress, signal, options) => {
        return this.ragService.indexProject(
          projectId,
          onProgress,
          signal,
          options,
        );
      },

      deleteRagProject: async (projectId) => {
        await this.ragService.deleteProjectIndex(projectId);
      },

      getRagContext: async (query, signal) => {
        return this.ragService.retrieveContext(query, signal);
      },

      markRagProjectsOutdated: (reason) => {
        this.ragService.markAllProjectsOutdated(reason);
      },
    });

    // Connect router → panel manager
    this.panelManager.setMessageHandler((data, webview) => {
      this.handleWebviewMessage(data, webview);
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

    webviewView.webview.onDidReceiveMessage((data) => {
      this.handleWebviewMessage(data, webviewView.webview);
    });

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        return;
      }

      void this.sendAvailableLlmsToWebview(webviewView.webview);
      void webviewView.webview.postMessage({ type: "sincronizarChat" });
    });
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

  private broadcastQuickAnalysisAvailability(
    available: boolean,
    hasEditorContext = this.quickAnalysisController.hasAnalyzableEditor(),
  ): void {
    const message = {
      type: "disponibilidadeMarcacoesAnaliseRapida",
      value: { available, hasEditorContext },
    };

    void this._view?.webview.postMessage(message);
    this.panelManager.postMessage(message);
  }

  private broadcastEngineControlStatus(value: {
    loading: boolean;
    running: boolean;
    message: string;
  }): void {
    const message = {
      type: "engineControlStatus",
      value,
    };

    void this._view?.webview.postMessage(message);
    this.panelManager.postMessage(message);
  }

  private handleWebviewMessage(data: unknown, webview: vscode.Webview): void {
    void this.messageRouter.handle(data, webview).catch((error) => {
      console.error("[ATLAS] Erro ao processar mensagem do webview:", error);
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
    const model = this.getActiveModelForEngineStartup();

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

  private async startLocalEngineForActiveModel(): Promise<void> {
    const model = this.getActiveModelForEngineStartup();

    if (!model) {
      throw new Error(
        "Nenhum modelo local selecionado para iniciar a engine.",
      );
    }

    await this.localEngineService.ensureEngine(model);
  }

  private getActiveModelForEngineStartup() {
    this.localModelDiscoveryService.refreshLocalModels();
    const model = this.configManager.getActiveLocalModel();

    return model;
  }

  public dispose(): void {
    this.ragService.dispose();
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
