import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { ChatResponseController } from "./ChatResponseController";
import { ChatSessionController } from "./ChatSessionController";
import { RouterDependencies } from "./ChatMessageRouterTypes";
import {
  RagEmbeddingModelInfo,
  RagIndexingMode,
  RagIndexingProgress,
  RagRuntimeStatus,
} from "../interfaces/AtlasRagTypes";
import {
  AtlasContextProfileSettings,
  AtlasRagSettings,
  AtlasResponseLanguage,
} from "../interfaces/AtlasConfigTypes";
import { AtlasExternalDocumentParser } from "../services/AtlasExternalDocumentParser";
import { AtlasContextProfileService } from "../services/AtlasContextProfileService";

export class ChatMessageRouter {
  private activeWebviewRoute = "chat";
  private ragIndexController: AbortController | null = null;
  private readonly responseController: ChatResponseController;
  private readonly sessionController: ChatSessionController;

  constructor(private readonly deps: RouterDependencies) {
    this.responseController = new ChatResponseController(
      this.deps,
      (sessionId) => this.isViewingGeneratedChat(sessionId),
    );

    this.sessionController = new ChatSessionController(
      this.deps,
      () => this.responseController.serializeActiveGeneration(),
      async (webview, error, fallback) => {
        await this.postError(webview, error, fallback);
      },
    );
  }

  public async handle(data: any, webview: vscode.Webview): Promise<void> {
    if (data.type === "requestModels") {
      this.deps.sendModelsToWebview(webview);
      return;
    }

    if (data.type === "carregarLLMs") {
      await this.handleLoadLlms(webview);
      return;
    }

    const handledByApiKeyManager = await this.deps.apiKeyManager.handleMessage(
      data,
      webview,
    );

    if (handledByApiKeyManager) {
      return;
    }

    switch (data.type) {
      case "atualizarViewAtual":
        this.handleUpdateCurrentView(data);
        return;
      case "enviarPergunta":
        await this.responseController.handleSendQuestion(data, webview);
        return;
      case "cancelarGeracao":
        this.deps.cancelQuickAnalysis();
        await this.responseController.handleCancelGeneration(webview);
        return;
      case "abrirPainelConfig":
        this.deps.openPanel(data.selectedView);
        return;
      case "abrirDetalhesModelo":
        this.deps.openSearchModelDetails(data.modelId);
        return;
      case "selecionarModo":
        await this.handleSelectMode(data, webview);
        return;
      case "salvarConfiguracoesCloud":
        await this.handleSaveCloudConfigs(data, webview);
        return;
      case "carregarConfiguracoesCloud":
        await this.handleLoadCloudConfigs(webview);
        return;
      case "carregarConfiguracoesAtlas":
        await this.handleLoadAtlasSettings(webview);
        return;
      case "carregarEstadoRag":
        await this.handleLoadRagStatus(webview);
        return;
      case "inicializarRag":
        await this.handleInitializeRag(webview);
        return;
      case "salvarConfiguracoesRag":
        await this.handleSaveRagSettings(data, webview);
        return;
      case "selecionarPastaModelosEmbeddingRag":
        await this.handleSelectRagEmbeddingModelsFolder(webview);
        return;
      case "abrirPastaModelosEmbeddingRag":
        await this.handleOpenRagEmbeddingModelsFolder();
        return;
      case "atualizarModelosEmbeddingRag":
        await this.handleRefreshRagEmbeddingModels(data, webview);
        return;
      case "baixarModeloEmbeddingPadraoRag":
        await this.handleDownloadDefaultRagEmbeddingModel(webview);
        return;
      case "selecionarModeloEmbeddingRag":
        await this.handleSelectRagEmbeddingModel(data, webview);
        return;
      case "mostrarNotificacaoRag":
        this.handleRagNotification(data);
        return;
      case "adicionarDocumentoExternoRag":
        await this.handleAddExternalRagDocuments(webview);
        return;
      case "excluirDocumentoExternoRag":
        await this.handleDeleteExternalRagDocument(data, webview);
        return;
      case "removerTodosDocumentosExternosRag":
        await this.handleClearExternalRagDocuments(webview);
        return;
      case "indexarWorkspaceRag":
        await this.handleIndexWorkspaceRag(
          webview,
          "workspace",
          undefined,
          this.normalizeRagIndexingMode(data.indexingMode),
        );
        return;
      case "selecionarPastaRag":
        await this.handleIndexWorkspaceRag(
          webview,
          "folder",
          undefined,
          this.normalizeRagIndexingMode(data.indexingMode),
        );
        return;
      case "reindexarProjetoRag":
        await this.handleIndexWorkspaceRag(
          webview,
          "project",
          typeof data.projectId === "string" ? data.projectId : undefined,
          this.normalizeRagIndexingMode(data.indexingMode),
        );
        return;
      case "cancelarIndexacaoRag":
        await this.handleCancelRagIndexing(webview);
        return;
      case "excluirProjetoRag":
        await this.handleDeleteRagProject(data, webview);
        return;
      case "salvarConfiguracoesAtlas":
        await this.handleSaveAtlasSettings(data, webview);
        return;
      case "selecionarPastaModelosLocais":
        await this.handleSelectLocalModelsFolder(webview);
        return;
      case "selecionarPastaEnginesLocais":
        await this.handleSelectLocalEnginesFolder(webview);
        return;
      case "abrirPastaEnginesLocais":
        await this.handleOpenLocalEnginesFolder();
        return;
      case "selecionarModelo":
        await this.handleSelectModel(data, webview);
        return;
      case "carregarComportamentoModelo":
        await this.handleLoadModelBehavior(webview);
        return;
      case "salvarComportamentoModelo":
        await this.handleSaveModelBehavior(data, webview);
        return;
      case "selecionarProviderCloud":
        await this.handleSelectCloudProvider(data, webview);
        return;
      case "saveModelParams":
        await this.handleSaveModelParams(data, webview);
        return;
      case "saveModelBehavior":
        await this.handleSaveModelBehaviorForLocalModel(data, webview);
        return;
      case "editModelMetadata":
        await this.handleEditModelMetadata(data, webview);
        return;
      case "deleteModelRequest":
        await this.handleDeleteModelRequest(data, webview);
        return;
      case "openLocalModelsFolder":
        await this.handleOpenLocalModelsFolder();
        return;
      case "startLocalEngineRequest":
        await this.handleStartLocalEngineRequest(webview);
        return;
      case "stopLocalEngineRequest":
        await this.handleStopLocalEngineRequest(webview);
        return;
      case "loadModelRequest":
        await this.handleLoadModelRequest(data, webview);
        return;
      case "executarAnaliseRapida":
        await this.deps.executeQuickAnalysis(webview);
        return;
      case "limparMarcacoesAnaliseRapida":
        this.deps.clearQuickAnalysisDecorations();
        return;
      case "consultarMarcacoesAnaliseRapida":
        await this.deps.sendQuickAnalysisAvailability(webview);
        return;
      case "alterarModoEstudo":
        await this.handleToggleStudyMode(data, webview);
        return;
      case "criarSessao":
        await this.sessionController.handleCreateSession(data, webview);
        return;
      case "trocarSessao":
        await this.sessionController.handleSwitchSession(data, webview);
        return;
      case "excluirSessao":
        await this.sessionController.handleDeleteSession(data, webview);
        return;
      case "renomearSessao":
        await this.sessionController.handleRenameSession(data, webview);
        return;
      case "listarSessoes":
        await this.sessionController.handleListSessions(webview);
        return;
    }
  }

  private async handleLoadLlms(webview: vscode.Webview): Promise<void> {
    try {
      const providers = this.deps.configManager.getAllProviders();
      const localModels = this.deps.refreshLocalModels();

      await webview.postMessage({
        type: "informarLLMsCarregados",
        value: {
          selectedMode: this.deps.configManager.getCurrentMode(),
          selectedProviderId:
            this.deps.configManager.getSelectedCloudProviderId(),
          selectedCloudModelId:
            this.deps.configManager.getSelectedCloudModelId(),
          selectedLocalModelId:
            this.deps.configManager.getActiveLocalModel()?.id ?? null,
          studyModeEnabled: this.deps.configManager.isStudyModeEnabled(),
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
      await this.postError(webview, error, "Erro ao carregar LLMs.");
    }
  }

  private async handleLoadRagStatus(webview: vscode.Webview): Promise<void> {
    const settings = this.deps.configManager.getSection("rag");
    let runtime = this.deps.getRagRuntimeStatus();

    if (settings.enabled && !runtime.running) {
      try {
        runtime = await this.deps.initializeRag();
      } catch (error) {
        runtime = {
          ...this.deps.getRagRuntimeStatus(),
          errorMessage: this.getErrorMessage(
            error,
            "Não foi possível inicializar o ChromaDB.",
          ),
        };
      }
    }

    await webview.postMessage({
      type: "estadoRagCarregado",
      value: this.getRagStatePayload(runtime, settings),
    });
  }

  private async handleInitializeRag(webview: vscode.Webview): Promise<void> {
    try {
      const runtime = await this.deps.initializeRag();

      await webview.postMessage({
        type: "estadoRagCarregado",
        value: this.getRagStatePayload(runtime),
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Não foi possível inicializar o ChromaDB.",
      );
    }
  }

  private async handleSaveRagSettings(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const payload = data.payload ?? {};
      const current = this.deps.configManager.getSection("rag");
      const topK = this.normalizeInteger(
        payload.topK,
        1,
        30,
        current.topK,
      );
      const maxContextCharacters = this.normalizeInteger(
        payload.maxContextCharacters,
        1000,
        100000,
        current.maxContextCharacters,
      );
      const ignoredPaths = this.normalizeIgnoredPaths(
        payload.ignoredPaths,
        current.ignoredPaths,
      );
      const chunkSize = this.normalizeInteger(
        payload.chunkSize,
        300,
        12000,
        current.chunkSize,
      );
      const chunkOverlap = this.normalizeInteger(
        payload.chunkOverlap,
        0,
        Math.floor(chunkSize / 2),
        Math.min(current.chunkOverlap, Math.floor(chunkSize / 2)),
      );
      const maxFileSizeBytes = this.normalizeInteger(
        payload.maxFileSizeBytes,
        1024 * 1024,
        100 * 1024 * 1024,
        current.maxFileSizeBytes,
      );
      const externalDocumentMaxFileSizeBytes = this.normalizeInteger(
        payload.externalDocumentMaxFileSizeBytes,
        1024 * 1024,
        250 * 1024 * 1024,
        current.externalDocumentMaxFileSizeBytes ?? 25 * 1024 * 1024,
      );
      const allowedExtensions = this.normalizeExtensions(
        payload.allowedExtensions,
        current.allowedExtensions,
      );
      const respectGitIgnore = payload.respectGitIgnore !== false;
      const includeMarkdownFiles = payload.includeMarkdownFiles !== false;
      const includeConfigFiles = payload.includeConfigFiles !== false;
      const indexOnAdd = payload.indexOnAdd !== false;
      const indexingMode = this.normalizeRagIndexingMode(
        payload.indexingMode,
      );
      const autoIndexDebounceMs = this.normalizeInteger(
        payload.autoIndexDebounceMs,
        500,
        60000,
        current.autoIndexDebounceMs,
      );
      const relevanceMode =
        payload.relevanceMode === "minRelevance"
          ? "minRelevance"
          : "maxDistance";
      const relevanceThreshold = this.normalizeNumber(
        payload.relevanceThreshold,
        0,
        relevanceMode === "minRelevance" ? 1 : 2,
        current.relevanceThreshold,
      );
      const maxChunksPerFile = this.normalizeInteger(
        payload.maxChunksPerFile,
        1,
        20,
        current.maxChunksPerFile,
      );
      const sourcePriority =
        payload.sourcePriority === "code" ||
        payload.sourcePriority === "documentation"
          ? payload.sourcePriority
          : "balanced";
      const languageFilters = this.normalizeSimpleList(
        payload.languageFilters,
        current.languageFilters,
      );
      const directoryFilters = this.normalizeIgnoredPaths(
        payload.directoryFilters,
        current.directoryFilters,
      );
      const embeddingModel = this.normalizeEmbeddingModelId(
        payload.embeddingModel,
        current.embeddingModel,
      );
      const indexShapeChanged =
        JSON.stringify(ignoredPaths) !== JSON.stringify(current.ignoredPaths) ||
        embeddingModel !== current.embeddingModel ||
        chunkSize !== current.chunkSize ||
        chunkOverlap !== current.chunkOverlap ||
        maxFileSizeBytes !== current.maxFileSizeBytes ||
        JSON.stringify(allowedExtensions) !==
          JSON.stringify(current.allowedExtensions) ||
        respectGitIgnore !== current.respectGitIgnore ||
        includeMarkdownFiles !== current.includeMarkdownFiles ||
        includeConfigFiles !== current.includeConfigFiles;
      const config = this.deps.configManager.updateRagSettings({
        enabled: payload.enabled === true,
        autoIndex: payload.autoIndex === true,
        allowLocalContext:
          typeof payload.allowLocalContext === "boolean"
            ? payload.allowLocalContext
            : current.allowLocalContext !== false,
        allowCloudContext: payload.allowCloudContext === true,
        offlineOnly: payload.allowCloudContext !== true,
        topK,
        maxContextCharacters,
        ignoredPaths,
        embeddingModel,
        chunkSize,
        chunkOverlap,
        maxFileSizeBytes,
        externalDocumentMaxFileSizeBytes,
        allowedExtensions,
        respectGitIgnore,
        includeMarkdownFiles,
        includeConfigFiles,
        indexOnAdd,
        indexingMode,
        autoIndexDebounceMs,
        relevanceMode,
        relevanceThreshold,
        maxChunksPerFile,
        diversifyFiles: payload.diversifyFiles === true,
        excludeActiveFile: payload.excludeActiveFile === true,
        includeExternalDocuments: payload.includeExternalDocuments === true,
        sourcePriority,
        languageFilters,
        directoryFilters,
        showSources: payload.showSources === true,
      });

      if (indexShapeChanged) {
        this.deps.markRagProjectsOutdated(
          "As configurações de indexação foram alteradas; reindexe o projeto.",
        );
      }

      let runtime = this.deps.getRagRuntimeStatus();

      if (config.rag.enabled && !runtime.running) {
        runtime = await this.deps.initializeRag();
      } else if (!config.rag.enabled && runtime.running) {
        this.deps.stopRag();
        runtime = this.deps.getRagRuntimeStatus();
      }

      await webview.postMessage({
        type: "estadoRagCarregado",
        value: this.getRagStatePayload(runtime, config.rag),
      });
      await webview.postMessage({
        type: "configuracoesRagSalvas",
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Não foi possível salvar as configurações do RAG.",
      );
    }
  }

  private async handleSelectRagEmbeddingModelsFolder(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const selected = await vscode.window.showOpenDialog({
        title: "Selecionar pasta de modelos de embeddings",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(this.deps.getRagEmbeddingModelsDir()),
        openLabel: "Usar esta pasta",
      });

      const folder = selected?.[0]?.fsPath;

      if (!folder) {
        return;
      }

      const current = this.deps.configManager.getSection("rag");
      let config = this.deps.configManager.updateRagSettings({
        embeddingModelsDir: folder,
      });
      const models = this.deps.refreshRagEmbeddingModels();
      const currentModelExists = models.some(
        (model) => model.id === current.embeddingModel,
      );

      if (!currentModelExists && models[0]) {
        config = this.deps.configManager.updateRagSettings({
          embeddingModel: models[0].id,
        });
        this.deps.markRagProjectsOutdated(
          "O modelo de embeddings foi alterado; reindexe o projeto.",
        );
      }

      await webview.postMessage({
        type: "estadoRagCarregado",
        value: this.getRagStatePayload(
          this.deps.getRagRuntimeStatus(),
          config.rag,
          models,
        ),
      });

      vscode.window.showInformationMessage(
        "ATLAS: pasta de modelos de embeddings atualizada.",
      );
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao selecionar pasta de modelos de embeddings.",
      );
    }
  }

  private async handleOpenRagEmbeddingModelsFolder(): Promise<void> {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(this.deps.getRagEmbeddingModelsDir()),
    );
  }

  private async handleRefreshRagEmbeddingModels(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const silent = data.silent === true;

      await webview.postMessage({
        type: "modelosEmbeddingRagAtualizados",
        value: {
          models: this.deps.refreshRagEmbeddingModels(),
          modelsDir: this.deps.getRagEmbeddingModelsDir(),
          selectedModelId:
            this.deps.configManager.getSection("rag").embeddingModel,
          silent,
        },
      });

      if (!silent) {
        vscode.window.showInformationMessage(
          "ATLAS: lista de modelos de embeddings atualizada.",
        );
      }
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao atualizar modelos de embeddings.",
      );
    }
  }

  private async handleDownloadDefaultRagEmbeddingModel(
    webview: vscode.Webview,
  ): Promise<void> {
    const controller = new AbortController();

    try {
      const model = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "ATLAS: baixando modelo padrão de embeddings",
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            controller.abort();
          });

          return this.deps.downloadDefaultRagEmbeddingModel(
            (downloadProgress) => {
              const status = downloadProgress.skipped
                ? "já disponível"
                : "baixando";
              progress.report({
                message: `${downloadProgress.processedFiles}/${downloadProgress.totalFiles} • ${status}: ${downloadProgress.fileName}`,
              });
            },
            controller.signal,
          );
        },
      );

      const current = this.deps.configManager.getSection("rag");
      const config = this.deps.configManager.updateRagSettings({
        embeddingModel: model.id,
      });
      const models = this.deps.refreshRagEmbeddingModels();

      if (current.embeddingModel !== model.id) {
        this.deps.markRagProjectsOutdated(
          "O modelo de embeddings foi alterado; reindexe o projeto.",
        );
      }

      await webview.postMessage({
        type: "estadoRagCarregado",
        value: this.getRagStatePayload(
          this.deps.getRagRuntimeStatus(),
          config.rag,
          models,
        ),
      });

      vscode.window.showInformationMessage(
        "ATLAS: modelo padrão de embeddings baixado e selecionado.",
      );
    } catch (error) {
      if (controller.signal.aborted) {
        await webview.postMessage({
          type: "downloadModeloEmbeddingRagCancelado",
        });
        vscode.window.showWarningMessage(
          "ATLAS: download do modelo de embeddings cancelado.",
        );
        return;
      }

      await this.postError(
        webview,
        error,
        "Erro ao baixar modelo padrão de embeddings.",
      );
    }
  }

  private async handleSelectRagEmbeddingModel(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const modelId = this.normalizeEmbeddingModelId(data.modelId, "");
      const models = this.deps.refreshRagEmbeddingModels();

      if (!modelId || !models.some((model) => model.id === modelId)) {
        throw new Error("Modelo de embeddings inválido ou não encontrado.");
      }

      const current = this.deps.configManager.getSection("rag");
      const config = this.deps.configManager.updateRagSettings({
        embeddingModel: modelId,
      });

      if (current.embeddingModel !== modelId) {
        this.deps.markRagProjectsOutdated(
          "O modelo de embeddings foi alterado; reindexe o projeto.",
        );
      }

      await webview.postMessage({
        type: "estadoRagCarregado",
        value: this.getRagStatePayload(
          this.deps.getRagRuntimeStatus(),
          config.rag,
          models,
        ),
      });

      vscode.window.showInformationMessage(
        "ATLAS: modelo de embeddings selecionado.",
      );
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao selecionar modelo de embeddings.",
      );
    }
  }

  private handleRagNotification(data: any): void {
    const message =
      typeof data.message === "string" ? data.message.trim() : "";

    if (!message) {
      return;
    }

    if (data.level === "error") {
      vscode.window.showErrorMessage(`ATLAS: ${message}`);
      return;
    }

    if (data.level === "warning") {
      vscode.window.showWarningMessage(`ATLAS: ${message}`);
      return;
    }

    vscode.window.showInformationMessage(`ATLAS: ${message}`);
  }

  private getRagStatePayload(
    runtime: RagRuntimeStatus,
    settings: AtlasRagSettings = this.deps.configManager.getSection("rag"),
    embeddingModels: RagEmbeddingModelInfo[] =
      this.deps.refreshRagEmbeddingModels(),
  ) {
    return {
      settings,
      runtime,
      projects: this.deps.listRagProjects(),
      externalDocuments: this.deps.listExternalRagDocuments(),
      embeddingModels,
      embeddingModelsDir: this.deps.getRagEmbeddingModelsDir(),
    };
  }

  private normalizeInteger(
    value: unknown,
    minimum: number,
    maximum: number,
    fallback: number,
  ): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : Number.NaN;

    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      return fallback;
    }

    return parsed;
  }

  private normalizeNumber(
    value: unknown,
    minimum: number,
    maximum: number,
    fallback: number,
  ): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseFloat(value)
          : Number.NaN;

    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
      ? parsed
      : fallback;
  }

  private normalizeRagIndexingMode(value: unknown): RagIndexingMode {
    if (value === "full" || value === "incremental") {
      return value;
    }

    return this.deps.configManager.getSection("rag").indexingMode === "full"
      ? "full"
      : "incremental";
  }

  private normalizeIgnoredPaths(
    value: unknown,
    fallback: string[],
  ): string[] {
    if (!Array.isArray(value)) {
      return fallback;
    }

    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().replace(/\\/g, "/"))
          .filter(
            (item) =>
              Boolean(item) &&
              item.length <= 200 &&
              !path.isAbsolute(item) &&
              !item.split("/").includes(".."),
          ),
      ),
    ).slice(0, 100);
  }

  private normalizeExtensions(
    value: unknown,
    fallback: string[],
  ): string[] {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const extensions = Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
          .map((item) => (item.startsWith(".") ? item : `.${item}`))
          .filter((item) => /^\.[a-z0-9][a-z0-9._+-]*$/i.test(item)),
      ),
    ).slice(0, 100);

    return extensions.length ? extensions : fallback;
  }

  private normalizeSimpleList(
    value: unknown,
    fallback: string[],
  ): string[] {
    if (!Array.isArray(value)) {
      return fallback;
    }

    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter((item) => Boolean(item) && item.length <= 100),
      ),
    ).slice(0, 100);
  }

  private normalizeEmbeddingModelId(
    value: unknown,
    fallback: string,
  ): string {
    const modelId = typeof value === "string" ? value.trim() : "";

    if (
      !modelId ||
      modelId.length > 120 ||
      modelId.includes("/") ||
      modelId.includes("\\") ||
      modelId.includes("..")
    ) {
      return fallback;
    }

    return modelId;
  }

  private async handleAddExternalRagDocuments(
    webview: vscode.Webview,
  ): Promise<void> {
    let controller: AbortController | null = null;

    try {
      const supportedExtensions =
        AtlasExternalDocumentParser.getSupportedExtensions().map((extension) =>
          extension.replace(/^\./, ""),
        );
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: {
          "Documentos suportados": supportedExtensions,
          "Todos os arquivos": ["*"],
        },
        openLabel: "Adicionar ao RAG",
        title: "Selecione documentos externos para o RAG",
      });

      if (!selection?.length) {
        await webview.postMessage({
          type: "documentosExternosRagAtualizados",
          value: {
            cancelled: true,
            documents: this.deps.listExternalRagDocuments(),
            importedCount: 0,
            skipped: [],
          },
        });
        return;
      }

      controller = new AbortController();
      const activeController = controller;
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "ATLAS: adicionando documentos ao RAG",
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            controller?.abort();
          });

          return this.deps.addExternalRagDocuments(
            selection,
            (importProgress) => {
              const currentFile = importProgress.currentFile
                ? ` - ${importProgress.currentFile}`
                : "";
              progress.report({
                message: `${importProgress.processedFiles}/${importProgress.totalFiles}${currentFile}`,
              });
            },
            activeController.signal,
          );
        },
      );

      await webview.postMessage({
        type: "documentosExternosRagAtualizados",
        value: {
          documents: result.documents,
          importedCount: result.imported.length,
          skipped: result.skipped,
        },
      });
    } catch (error) {
      if (controller?.signal.aborted) {
        await webview.postMessage({
          type: "documentosExternosRagAtualizados",
          value: {
            cancelled: true,
            documents: this.deps.listExternalRagDocuments(),
            importedCount: 0,
            skipped: [],
          },
        });
        return;
      }

      await this.postError(
        webview,
        error,
        "Nao foi possivel adicionar documentos externos ao RAG.",
      );
    }
  }

  private async handleDeleteExternalRagDocument(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const sourceId = typeof data.sourceId === "string" ? data.sourceId : "";

      if (!sourceId) {
        throw new Error("Documento externo RAG invalido.");
      }

      const answer = await vscode.window.showWarningMessage(
        "Deseja excluir este documento externo do RAG?",
        { modal: true },
        "Excluir",
      );

      if (answer !== "Excluir") {
        await webview.postMessage({
          type: "documentosExternosRagAtualizados",
          value: {
            cancelled: true,
            documents: this.deps.listExternalRagDocuments(),
            importedCount: 0,
            skipped: [],
          },
        });
        return;
      }

      const documents = await this.deps.deleteExternalRagDocument(sourceId);

      await webview.postMessage({
        type: "documentosExternosRagAtualizados",
        value: {
          documents,
          deleted: true,
          importedCount: 0,
          skipped: [],
        },
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Nao foi possivel excluir o documento externo.",
      );
    }
  }

  private async handleClearExternalRagDocuments(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const answer = await vscode.window.showWarningMessage(
        "Deseja remover todos os documentos externos deste workspace do RAG?",
        { modal: true },
        "Remover todos",
      );

      if (answer !== "Remover todos") {
        await webview.postMessage({
          type: "documentosExternosRagAtualizados",
          value: {
            cancelled: true,
            documents: this.deps.listExternalRagDocuments(),
            importedCount: 0,
            skipped: [],
          },
        });
        return;
      }

      const documents = await this.deps.clearExternalRagDocuments();

      await webview.postMessage({
        type: "documentosExternosRagAtualizados",
        value: {
          documents,
          deletedAll: true,
          importedCount: 0,
          skipped: [],
        },
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Nao foi possivel remover os documentos externos.",
      );
    }
  }

  private async handleIndexWorkspaceRag(
    webview: vscode.Webview,
    source: "workspace" | "folder" | "project",
    projectId?: string,
    indexingMode?: RagIndexingMode,
  ): Promise<void> {
    if (this.ragIndexController) {
      await webview.postMessage({
        type: "erro",
        value: "Já existe uma indexação RAG em andamento.",
      });
      return;
    }

    const controller = new AbortController();
    this.ragIndexController = controller;

    try {
      let selectedFolder: vscode.Uri | undefined;

      if (source === "folder") {
        const selection = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Indexar pasta",
          title: "Selecione a pasta que será indexada pelo RAG",
        });
        selectedFolder = selection?.[0];

        if (!selectedFolder) {
          await webview.postMessage({
            type: "indexacaoRagCancelada",
            value: {
              projects: this.deps.listRagProjects(),
            },
          });
          return;
        }

        if (!this.deps.configManager.getSection("rag").indexOnAdd) {
          const project = this.deps.registerSelectedFolder(selectedFolder);
          await webview.postMessage({
            type: "projetoRagAdicionado",
            value: {
              project,
              projects: this.deps.listRagProjects(),
            },
          });
          return;
        }
      }

      if (source === "project" && !projectId) {
        throw new Error("Projeto RAG inválido para reindexação.");
      }

      const onProgress = async (progress: RagIndexingProgress) => {
        await webview.postMessage({
          type: "progressoIndexacaoRag",
          value: progress,
        });
      };
      const project =
        source === "project"
          ? await this.deps.indexRagProject(
              projectId!,
              onProgress,
              controller.signal,
              { mode: indexingMode },
            )
          : selectedFolder
            ? await this.deps.indexSelectedFolder(
                selectedFolder,
                onProgress,
                controller.signal,
                { mode: indexingMode },
              )
            : await this.deps.indexCurrentWorkspace(
                onProgress,
                controller.signal,
                { mode: indexingMode },
              );

      await webview.postMessage({
        type: "indexacaoRagConcluida",
        value: {
          project,
          projects: this.deps.listRagProjects(),
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        await webview.postMessage({
          type: "indexacaoRagCancelada",
          value: {
            projects: this.deps.listRagProjects(),
          },
        });
        return;
      }

      await this.postError(
        webview,
        error,
        "Não foi possível indexar o workspace.",
      );
    } finally {
      if (this.ragIndexController === controller) {
        this.ragIndexController = null;
      }
    }
  }

  private async handleCancelRagIndexing(webview: vscode.Webview): Promise<void> {
    const controller = this.ragIndexController;

    if (!controller || controller.signal.aborted) {
      await webview.postMessage({
        type: "cancelamentoIndexacaoRagIndisponivel",
      });
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      "Tem certeza que deseja cancelar a indexação em andamento?",
      { modal: true },
      "Cancelar indexação",
    );

    if (answer !== "Cancelar indexação") {
      await webview.postMessage({
        type: "cancelamentoIndexacaoRagRecusado",
      });
      return;
    }

    controller.abort();
    await webview.postMessage({
      type: "cancelamentoIndexacaoRagSolicitado",
    });
  }

  private async handleDeleteRagProject(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const projectId =
        typeof data.projectId === "string" ? data.projectId : "";

      if (!projectId) {
        throw new Error("Projeto RAG inválido.");
      }

      const answer = await vscode.window.showWarningMessage(
        "Deseja excluir a base vetorial deste projeto?",
        { modal: true },
        "Excluir",
      );

      if (answer !== "Excluir") {
        return;
      }

      await this.deps.deleteRagProject(projectId);
      await webview.postMessage({
        type: "projetoRagExcluido",
        value: {
          projects: this.deps.listRagProjects(),
        },
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Não foi possível excluir a base vetorial.",
      );
    }
  }

  private handleUpdateCurrentView(data: any): void {
    const view = typeof data.view === "string" ? data.view : "chat";
    this.activeWebviewRoute = view;
  }

  private async handleSelectMode(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      this.deps.configManager.setMode(data.mode);

      if (data.mode === "cloud") {
        await this.deps.promptStopLocalEngine();
      }

      if (
        data.mode === "local" &&
        !this.deps.configManager.getActiveLocalModel()
      ) {
        this.deps.refreshLocalModels();
        const firstLocalModel = this.deps.configManager.getLocalModels()[0];

        if (firstLocalModel) {
          this.deps.configManager.setActiveLocalModel(firstLocalModel.id);
        }
      }

      await webview.postMessage({
        type: "modoSelecionado",
        value: {
          mode: data.mode,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao selecionar modo.");
    }
  }

  private async handleSaveCloudConfigs(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const {
        limitPayload,
        dynamicMaxTokens,
        maxTokens,
        timeout,
        temperature,
        topP,
        stream,
      } = data.payload ?? {};

      const updatedConfig = this.deps.configManager.updateCloudConfigs({
        limitPayload,
        dynamicMaxTokens,
        maxTokens,
        timeout,
        temperature,
        topP,
        stream,
      });

      await webview.postMessage({
        type: "configuracoesCloudSalvas",
        value: updatedConfig.cloudConfigs,
      });

      vscode.window.showInformationMessage("Configurações de execução salvas.");
    } catch (error) {
      const message = this.getErrorMessage(error, "Erro desconhecido");

      await webview.postMessage({
        type: "erro",
        value: message,
      });

      vscode.window.showErrorMessage(
        `Erro ao salvar configurações: ${message}`,
      );
    }
  }

  private async handleLoadCloudConfigs(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const cloudConfigs =
        this.deps.configManager.getSection("cloudConfigs");

      await webview.postMessage({
        type: "configuracoesCloudCarregadas",
        value: cloudConfigs,
      });
    } catch (error) {
      const message = this.getErrorMessage(error, "Erro desconhecido");

      await webview.postMessage({
        type: "erro",
        value: message,
      });

      vscode.window.showErrorMessage(
        `Erro ao carregar configurações: ${message}`,
      );
    }
  }

  private async handleSelectModel(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      if (data.mode === "local") {
        const currentModel = this.deps.configManager.getActiveLocalModel();

        if (currentModel?.id !== data.modelId) {
          this.deps.stopLocalEngine();
        }

        this.deps.configManager.setActiveLocalModel(data.modelId);
      } else if (data.mode === "cloud") {
        this.deps.configManager.setActiveCloudModel(data.modelId);
      }

      await webview.postMessage({
        type: "modeloSelecionado",
        value: {
          mode: data.mode,
          modelId: data.modelId,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao selecionar modelo.");
    }
  }

  private async handleSaveModelParams(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const modelId = typeof data.modelId === "string" ? data.modelId : "";

      if (!modelId) {
        throw new Error("Modelo local inválido.");
      }

      const params =
        data.params && typeof data.params === "object"
          ? (data.params as Record<string, unknown>)
          : {};

      this.deps.configManager.updateModel(modelId, {
        parameters: params,
      });

      if (this.deps.configManager.getActiveLocalModel()?.id === modelId) {
        this.deps.stopLocalEngine();
      }

      await webview.postMessage({
        type: "modeloParametrosSalvos",
        value: { modelId },
      });

      this.deps.sendModelsToWebview(webview);
      vscode.window.showInformationMessage("Parâmetros do modelo salvos.");
    } catch (error) {
      await this.postError(webview, error, "Erro ao salvar modelo local.");
    }
  }

  private async handleLoadAtlasSettings(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      await webview.postMessage({
        type: "configuracoesAtlasCarregadas",
        value: this.getAtlasSettingsPayload(),
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao carregar configurações do ATLAS.",
      );
    }
  }

  private async handleSaveAtlasSettings(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const payload = data.payload ?? {};
      const language = this.normalizeResponseLanguage(payload.language);
      const localStream = payload.localStream !== false;
      const localTimeout = this.normalizeInteger(
        payload.localTimeout,
        0,
        600,
        30,
      );
      const currentCustom = this.deps.configManager.getConfig().custom ?? {};
      const contextProfile = this.normalizeContextProfilePayload(payload);
      const presetEffects =
        AtlasContextProfileService.getPresetEffects(contextProfile.mode);
      const currentLocalEngine =
        typeof currentCustom.localEngine === "object" &&
        currentCustom.localEngine !== null
          ? (currentCustom.localEngine as Record<string, unknown>)
          : {};
      const engineType = this.normalizeLocalEngineType(payload.engineType);
      const startOnAtlasOpen = payload.startOnAtlasOpen === true;
      const saveInterruptedResponses =
        payload.saveInterruptedResponses !== false;
      const dynamicContextWindow =
        presetEffects?.localEngine.dynamicContextWindow ??
        (payload.dynamicContextWindow !== false);
      const localModels =
        typeof currentCustom.localModels === "object" &&
        currentCustom.localModels !== null
          ? (currentCustom.localModels as Record<string, unknown>)
          : {};
      const modelsDir = this.normalizeFolderPath(payload.modelsDir);
      const enginesDir = this.normalizeFolderPath(payload.enginesDir);
      const staticAnalysisEnabled = payload.staticAnalysisEnabled === true;
      const staticAnalysisQuick =
        payload.staticAnalysisQuick === true;
      const staticAnalysisArchitectural =
        payload.staticAnalysisArchitectural === true;
      const staticAnalysisDiagnostics =
        payload.staticAnalysisDiagnostics === true;
      const staticAnalysisRelations =
        payload.staticAnalysisRelations === true;
      const staticAnalysis = presetEffects?.staticAnalysis ?? {
        enabled: staticAnalysisEnabled,
        useInQuickAnalysis: staticAnalysisQuick,
        useInArchitecturalAnalysis: staticAnalysisArchitectural,
        includeDiagnostics: staticAnalysisDiagnostics,
        includeSymbolRelations: staticAnalysisRelations,
      };

      this.deps.configManager.updateGeneralSettings({
        language,
      });

      this.deps.configManager.updateRagSettings({
        topK: contextProfile.ragTopK,
        maxContextCharacters: contextProfile.ragMaxContextCharacters,
      });

      this.deps.configManager.updateCustomRoot({
        ...currentCustom,
        contextProfile,
        saveInterruptedResponses,
        staticAnalysis,
        localModels: {
          ...localModels,
          modelsDir: modelsDir || this.deps.getLocalModelsDir(),
        },
        localEngine: {
          ...currentLocalEngine,
          engineType,
          startOnAtlasOpen,
          dynamicContextWindow,
          stream: localStream,
          timeout: localTimeout,
          enginesDir: enginesDir || this.deps.getLocalEnginesDir(),
        },
      });

      this.deps.stopLocalEngine();

      const saved = this.getAtlasSettingsPayload();

      await webview.postMessage({
        type: "configuracoesAtlasSalvas",
        value: saved,
      });

      vscode.window.showInformationMessage("Configurações do ATLAS salvas.");
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao salvar configurações do ATLAS.",
      );
    }
  }

  private async handleSaveModelBehaviorForLocalModel(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const modelId = typeof data.modelId === "string" ? data.modelId : "";

      if (!modelId) {
        throw new Error("Modelo local inválido.");
      }

      const customPromptEnabled = data.customPrompt === true;
      const systemPrompt =
        typeof data.systemPrompt === "string" ? data.systemPrompt.trim() : "";

      this.deps.configManager.updateModel(modelId, {
        custom: {
          systemPrompt:
            customPromptEnabled && systemPrompt ? systemPrompt : undefined,
        },
      });

      await webview.postMessage({
        type: "modeloComportamentoSalvo",
        value: { modelId },
      });

      this.deps.sendModelsToWebview(webview);
      vscode.window.showInformationMessage(
        "Comportamento do modelo local salvo.",
      );
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao salvar comportamento do modelo local.",
      );
    }
  }

  private async handleEditModelMetadata(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const modelId = typeof data.modelId === "string" ? data.modelId : "";

      if (!modelId) {
        throw new Error("Modelo local inválido.");
      }

      const model = this.deps.configManager.getLocalModel(modelId);

      if (!model) {
        throw new Error(`Modelo "${modelId}" não encontrado.`);
      }

      const nextName = await vscode.window.showInputBox({
        title: "Editar nome do modelo",
        prompt: "Nome exibido no seletor e na biblioteca",
        value: model.name || model.id,
        ignoreFocusOut: true,
      });

      if (nextName === undefined) {
        return;
      }

      const nextProvider = await vscode.window.showInputBox({
        title: "Editar provedor do modelo",
        prompt: "Exemplo: Google, Meta, Mistral AI, Local",
        value: model.provider || "Local",
        ignoreFocusOut: true,
      });

      if (nextProvider === undefined) {
        return;
      }

      this.deps.configManager.updateModel(modelId, {
        name: nextName.trim() || model.name || model.id,
        provider: nextProvider.trim() || "Local",
      });

      await webview.postMessage({
        type: "modeloMetadadosSalvos",
        value: { modelId },
      });

      this.deps.sendModelsToWebview(webview);
      vscode.window.showInformationMessage("Metadados do modelo salvos.");
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao editar metadados do modelo local.",
      );
    }
  }

  private async handleDeleteModelRequest(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const modelId = typeof data.modelId === "string" ? data.modelId : "";

      if (!modelId) {
        throw new Error("Modelo local inválido.");
      }

      const model = this.deps.configManager.getLocalModel(modelId);

      if (!model) {
        throw new Error(`Modelo "${modelId}" não encontrado.`);
      }

      const answer = await vscode.window.showWarningMessage(
        `Deseja excluir o modelo local "${model.name}"? Essa ação não poderá ser desfeita.`,
        { modal: true },
        "Excluir",
      );

      if (answer !== "Excluir") {
        return;
      }

      const modelPath = typeof model.path === "string" ? model.path : "";

      if (modelPath) {
        this.deleteModelFileFromModelsFolder(modelPath);
      }

      if (this.deps.configManager.getActiveLocalModel()?.id === modelId) {
        this.deps.stopLocalEngine();
      }

      this.deps.configManager.removeModel(modelId);

      await webview.postMessage({
        type: "modeloLocalExcluido",
        value: { modelId },
      });

      this.deps.sendModelsToWebview(webview);
      vscode.window.showInformationMessage("Modelo local excluido.");
    } catch (error) {
      await this.postError(webview, error, "Erro ao excluir modelo local.");
    }
  }

  private async handleLoadModelRequest(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const modelId = typeof data.modelId === "string" ? data.modelId : "";

      if (!modelId) {
        throw new Error("Modelo local inválido.");
      }

      const currentModel = this.deps.configManager.getActiveLocalModel();

      if (currentModel?.id !== modelId) {
        this.deps.stopLocalEngine();
      }

      this.deps.configManager.setActiveLocalModel(modelId);

      await webview.postMessage({
        type: "modeloLocalCarregado",
        value: { modelId },
      });

      vscode.window.showInformationMessage("Modelo local selecionado.");
    } catch (error) {
      await this.postError(webview, error, "Erro ao carregar modelo local.");
    }
  }

  private async handleOpenLocalModelsFolder(): Promise<void> {
    const modelsDir = this.deps.getLocalModelsDir();
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(modelsDir),
    );
  }

  private async handleOpenLocalEnginesFolder(): Promise<void> {
    const enginesDir = this.deps.getLocalEnginesDir();
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(enginesDir),
    );
  }

  private async handleSelectLocalModelsFolder(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const selected = await vscode.window.showOpenDialog({
        title: "Selecionar pasta de modelos GGUF",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(this.deps.getLocalModelsDir()),
        openLabel: "Usar esta pasta",
      });

      const folder = selected?.[0]?.fsPath;

      if (!folder) {
        return;
      }

      this.saveLocalModelsDir(folder);
      this.deps.stopLocalEngine();
      this.deps.refreshLocalModels();

      await webview.postMessage({
        type: "configuracoesAtlasCarregadas",
        value: this.getAtlasSettingsPayload(),
      });

      vscode.window.showInformationMessage(
        "Pasta de modelos locais atualizada.",
      );
    } catch (error) {
      await this.postError(webview, error, "Erro ao selecionar pasta de modelos.");
    }
  }

  private async handleSelectLocalEnginesFolder(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const selected = await vscode.window.showOpenDialog({
        title: "Selecionar pasta de engines do llama.cpp",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(this.deps.getLocalEnginesDir()),
        openLabel: "Usar esta pasta",
      });

      const folder = selected?.[0]?.fsPath;

      if (!folder) {
        return;
      }

      this.saveLocalEnginesDir(folder);
      this.deps.stopLocalEngine();

      await webview.postMessage({
        type: "configuracoesAtlasCarregadas",
        value: this.getAtlasSettingsPayload(),
      });

      vscode.window.showInformationMessage(
        "Pasta de engines locais atualizada.",
      );
    } catch (error) {
      await this.postError(webview, error, "Erro ao selecionar pasta de engines.");
    }
  }

  private async handleStartLocalEngineRequest(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      await webview.postMessage({
        type: "engineControlStatus",
        value: { loading: true, running: false, message: "Iniciando engine..." },
      });

      await this.deps.startLocalEngine();

      await webview.postMessage({
        type: "engineControlStatus",
        value: { loading: false, running: true, message: "Engine ativa." },
      });
      this.deps.sendModelsToWebview(webview);
      vscode.window.showInformationMessage("Engine local do ATLAS iniciada.");
    } catch (error) {
      await webview.postMessage({
        type: "engineControlStatus",
        value: { loading: false, running: false },
      });
      await this.postError(webview, error, "Erro ao iniciar engine local.");
    }
  }

  private async handleStopLocalEngineRequest(
    webview: vscode.Webview,
  ): Promise<void> {
    this.deps.stopLocalEngine();

    await webview.postMessage({
      type: "engineControlStatus",
      value: { loading: false, running: false, message: "Engine parada." },
    });
    this.deps.sendModelsToWebview(webview);
    vscode.window.showInformationMessage("Engine local do ATLAS encerrada.");
  }

  private async handleLoadModelBehavior(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const behavior = this.deps.promptCustomizationService.getBehaviorConfig();

      await webview.postMessage({
        type: "comportamentoModeloCarregado",
        value: behavior,
      });
    } catch (error) {
      await this.postError(
        webview,
        error,
        "Erro ao carregar comportamento do modelo.",
      );
    }
  }

  private async handleSaveModelBehavior(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const saved = this.deps.promptCustomizationService.saveBehaviorConfig(
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
      const message = this.getErrorMessage(
        error,
        "Erro ao salvar comportamento do modelo.",
      );

      await webview.postMessage({
        type: "erro",
        value: message,
      });

      vscode.window.showErrorMessage(message);
    }
  }

  private async handleSelectCloudProvider(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      this.deps.configManager.setSelectedCloudProvider(data.providerId);

      const models =
        await this.deps.cloudApiService.getModelsForCurrentProvider();

      await webview.postMessage({
        type: "modelosCloudCarregados",
        value: {
          providerId: data.providerId,
          models: models.map((model) => ({
            id: model.id,
            name: model.label || model.id,
          })),
        },
      });
    } catch (error) {
      const message = this.getErrorMessage(
        error,
        "Erro ao carregar modelos cloud.",
      );

      vscode.window.showErrorMessage(`ATLAS: ${message}`);

      await webview.postMessage({
        type: "modelosCloudErro",
        value: {
          providerId:
            typeof data.providerId === "string" ? data.providerId : null,
          message,
        },
      });
    }
  }

  private async handleToggleStudyMode(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const enabled = data.enabled === true;

      this.deps.configManager.setStudyModeEnabled(enabled);

      await webview.postMessage({
        type: "modoEstudoAtualizado",
        value: {
          enabled,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao alterar modo estudante.");
    }
  }

  private async postError(
    webview: vscode.Webview,
    error: unknown,
    fallback: string,
  ): Promise<void> {
    const message = this.getErrorMessage(error, fallback);

    vscode.window.showErrorMessage(`ATLAS: ${message}`);

    await webview.postMessage({
      type: "erro",
      value: message,
    });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private normalizeContextProfilePayload(
    payload: Record<string, unknown>,
  ): AtlasContextProfileSettings {
    const config = this.deps.configManager.getConfig();
    const current = this.deps.configManager.getContextProfile();
    const mode = AtlasContextProfileService.normalizeMode(
      payload.contextProfileMode,
      current.mode,
    );

    if (mode !== "custom") {
      return AtlasContextProfileService.getPreset(mode);
    }

    return AtlasContextProfileService.normalize(
      {
        mode,
        historyWindowSize:
          payload.contextHistoryWindow ?? current.historyWindowSize,
        includeArchitecturalMemory:
          typeof payload.contextMemoryEnabled === "boolean"
            ? payload.contextMemoryEnabled
            : current.includeArchitecturalMemory,
        includeRagContext:
          typeof payload.contextRagEnabled === "boolean"
            ? payload.contextRagEnabled
            : current.includeRagContext,
        includeEditorContext:
          typeof payload.contextEditorEnabled === "boolean"
            ? payload.contextEditorEnabled
            : current.includeEditorContext,
        maxEditorContextCharacters:
          payload.contextEditorLimit ?? current.maxEditorContextCharacters,
        includeStaticAnalysis:
          typeof payload.staticAnalysisEnabled === "boolean"
            ? payload.staticAnalysisEnabled
            : current.includeStaticAnalysis,
        ragTopK: payload.contextRagTopK ?? config.rag.topK,
        ragMaxContextCharacters:
          payload.contextRagLimit ?? config.rag.maxContextCharacters,
      },
      current,
    );
  }

  private getAtlasSettingsPayload() {
    const config = this.deps.configManager.getConfig();
    const localEngine = config.custom?.localEngine;
    const value =
      typeof localEngine === "object" && localEngine !== null
        ? (localEngine as Record<string, unknown>)
        : {};
    const staticAnalysis =
      this.deps.configManager.getStaticAnalysisConfig();
    const contextProfile = this.deps.configManager.getContextProfile();

    return {
      contextProfilePresets: this.getContextProfilePresetsPayload(),
      language: this.normalizeResponseLanguage(config.general.language),
      contextProfileMode: contextProfile.mode,
      contextHistoryWindow: contextProfile.historyWindowSize,
      contextMemoryEnabled: contextProfile.includeArchitecturalMemory,
      contextRagEnabled: contextProfile.includeRagContext,
      contextEditorEnabled: contextProfile.includeEditorContext,
      contextEditorLimit: contextProfile.maxEditorContextCharacters,
      contextRagTopK: config.rag.topK ?? contextProfile.ragTopK,
      contextRagLimit:
        config.rag.maxContextCharacters ??
        contextProfile.ragMaxContextCharacters,
      localStream: value.stream !== false,
      saveInterruptedResponses:
        config.custom?.saveInterruptedResponses !== false,
      localTimeout: this.normalizeInteger(
        value.timeout,
        0,
        600,
        config.cloudConfigs.timeout,
      ),
      engineType: this.normalizeLocalEngineType(value.engineType),
      startOnAtlasOpen: value.startOnAtlasOpen === true,
      dynamicContextWindow: value.dynamicContextWindow !== false,
      modelsDir: this.deps.getLocalModelsDir(),
      enginesDir: this.deps.getLocalEnginesDir(),
      staticAnalysisEnabled:
        staticAnalysis.enabled && contextProfile.includeStaticAnalysis,
      staticAnalysisQuick:
        staticAnalysis.useInQuickAnalysis &&
        contextProfile.includeStaticAnalysis,
      staticAnalysisArchitectural:
        staticAnalysis.useInArchitecturalAnalysis &&
        contextProfile.includeStaticAnalysis,
      staticAnalysisDiagnostics:
        staticAnalysis.includeDiagnostics &&
        contextProfile.includeStaticAnalysis,
      staticAnalysisRelations:
        staticAnalysis.includeSymbolRelations &&
        contextProfile.includeStaticAnalysis,
    };
  }

  private getContextProfilePresetsPayload() {
    return Object.fromEntries(
      (["light", "balanced", "advanced"] as const).map((mode) => {
        const effects = AtlasContextProfileService.getPresetEffects(mode);
        const profile =
          effects?.contextProfile ?? AtlasContextProfileService.getPreset(mode);
        const staticAnalysis = effects?.staticAnalysis;

        return [
          mode,
          {
            ...profile,
            dynamicContextWindow:
              effects?.localEngine.dynamicContextWindow ?? mode !== "light",
            staticAnalysis: {
              enabled: staticAnalysis?.enabled === true,
              quick: staticAnalysis?.useInQuickAnalysis === true,
              architectural:
                staticAnalysis?.useInArchitecturalAnalysis === true,
              diagnostics: staticAnalysis?.includeDiagnostics === true,
              relations: staticAnalysis?.includeSymbolRelations === true,
            },
          },
        ];
      }),
    );
  }

  private normalizeLocalEngineType(value: unknown): "cpu" | "cuda" | "vulkan" {
    if (value === "cuda" || value === "vulkan") {
      return value;
    }

    return "cpu";
  }

  private normalizeResponseLanguage(value: unknown): AtlasResponseLanguage {
    return value === "en-US" ? "en-US" : "pt-BR";
  }

  private normalizeFolderPath(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private saveLocalModelsDir(modelsDir: string): void {
    const currentCustom = this.deps.configManager.getConfig().custom ?? {};
    const currentLocalModels =
      typeof currentCustom.localModels === "object" &&
      currentCustom.localModels !== null
        ? (currentCustom.localModels as Record<string, unknown>)
        : {};

    this.deps.configManager.updateCustomRoot({
      ...currentCustom,
      localModels: {
        ...currentLocalModels,
        modelsDir,
      },
    });
  }

  private saveLocalEnginesDir(enginesDir: string): void {
    const currentCustom = this.deps.configManager.getConfig().custom ?? {};
    const currentLocalEngine =
      typeof currentCustom.localEngine === "object" &&
      currentCustom.localEngine !== null
        ? (currentCustom.localEngine as Record<string, unknown>)
        : {};

    this.deps.configManager.updateCustomRoot({
      ...currentCustom,
      localEngine: {
        ...currentLocalEngine,
        enginesDir,
      },
    });
  }

  private deleteModelFileFromModelsFolder(modelPath: string): void {
    const modelsDir = path.resolve(this.deps.getLocalModelsDir());
    const resolvedModelPath = path.resolve(modelPath);
    const relative = path.relative(modelsDir, resolvedModelPath);

    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      path.extname(resolvedModelPath).toLowerCase() !== ".gguf"
    ) {
      throw new Error(
        "Por seguranca, apenas arquivos .gguf dentro da pasta models podem ser excluidos.",
      );
    }

    if (fs.existsSync(resolvedModelPath)) {
      fs.unlinkSync(resolvedModelPath);
    }
  }

  private isViewingGeneratedChat(sessionId: string): boolean {
    return (
      this.deps.isChatViewVisible() &&
      this.activeWebviewRoute === "chat" &&
      this.deps.sessionService.getActiveSessionId() === sessionId
    );
  }
}
