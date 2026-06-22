import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { ChatResponseController } from "./ChatResponseController";
import { ChatSessionController } from "./ChatSessionController";
import { RouterDependencies } from "./ChatMessageRouterTypes";

export class ChatMessageRouter {
  private activeWebviewRoute = "chat";
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
    const handledByApiKeyManager = await this.deps.apiKeyManager.handleMessage(
      data,
      webview,
    );

    if (handledByApiKeyManager) {
      return;
    }

    switch (data.type) {
      case "carregarLLMs":
        await this.handleLoadLlms(webview);
        return;
      case "atualizarViewAtual":
        this.handleUpdateCurrentView(data);
        return;
      case "enviarPergunta":
        await this.responseController.handleSendQuestion(data, webview);
        return;
      case "cancelarGeracao":
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
      case "salvarConfiguracoesSeguranca":
        await this.handleSaveSecuritySettings(data, webview);
        return;
      case "carregarConfiguracoesSeguranca":
        await this.handleLoadSecuritySettings(webview);
        return;
      case "carregarConfiguracoesAtlas":
        await this.handleLoadAtlasSettings(webview);
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
      case "requestModels":
        this.deps.sendModelsToWebview(webview);
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

  private async handleSaveSecuritySettings(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const {
        blockRag,
        limitPayload,
        maxTokens,
        timeout,
        temperature,
        topP,
        stream,
      } = data.payload ?? {};

      this.deps.configManager.updateSecuritySettings({
        blockRag,
        limitPayload,
        maxTokens,
        timeout,
      });

      this.deps.configManager.updateLlmDefaults({
        temperature,
        topP,
        maxTokens,
        stream,
      });

      const securitySettings =
        this.deps.configManager.getSection("cloudSecurity");
      const llmDefaults = this.deps.configManager.getConfig().llms.defaults;

      await webview.postMessage({
        type: "configuracoesSegurancaSalvas",
        value: {
          ...securitySettings,
          temperature: llmDefaults.temperature,
          topP: llmDefaults.topP,
          maxTokens: llmDefaults.maxTokens,
          stream: llmDefaults.stream,
        },
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

  private async handleLoadSecuritySettings(
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const securitySettings =
        this.deps.configManager.getSection("cloudSecurity");
      const llmDefaults = this.deps.configManager.getConfig().llms.defaults;

      await webview.postMessage({
        type: "configuracoesSegurancaCarregadas",
        value: {
          ...securitySettings,
          temperature: llmDefaults.temperature,
          topP: llmDefaults.topP,
          maxTokens: llmDefaults.maxTokens,
          stream: llmDefaults.stream,
        },
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
      const { tokensRes, ...modelParameters } = params;

      this.deps.configManager.updateModel(modelId, {
        parameters: modelParameters,
        custom: {
          tokensRes: typeof tokensRes === "number" ? tokensRes : undefined,
        },
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
      const currentCustom = this.deps.configManager.getConfig().custom ?? {};
      const currentLocalEngine =
        typeof currentCustom.localEngine === "object" &&
        currentCustom.localEngine !== null
          ? (currentCustom.localEngine as Record<string, unknown>)
          : {};
      const engineType = this.normalizeLocalEngineType(payload.engineType);
      const startOnAtlasOpen = payload.startOnAtlasOpen === true;
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

      this.deps.configManager.updateCustomRoot({
        ...currentCustom,
        staticAnalysis: {
          enabled: staticAnalysisEnabled,
          useInQuickAnalysis: staticAnalysisQuick,
          useInArchitecturalAnalysis: staticAnalysisArchitectural,
          includeDiagnostics: staticAnalysisDiagnostics,
          includeSymbolRelations: staticAnalysisRelations,
        },
        localModels: {
          ...localModels,
          modelsDir: modelsDir || this.deps.getLocalModelsDir(),
        },
        localEngine: {
          ...currentLocalEngine,
          engineType,
          startOnAtlasOpen,
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

  private getAtlasSettingsPayload() {
    const config = this.deps.configManager.getConfig();
    const localEngine = config.custom?.localEngine;
    const value =
      typeof localEngine === "object" && localEngine !== null
        ? (localEngine as Record<string, unknown>)
        : {};
    const staticAnalysis =
      this.deps.configManager.getStaticAnalysisConfig();

    return {
      engineType: this.normalizeLocalEngineType(value.engineType),
      startOnAtlasOpen: value.startOnAtlasOpen === true,
      modelsDir: this.deps.getLocalModelsDir(),
      enginesDir: this.deps.getLocalEnginesDir(),
      staticAnalysisEnabled: staticAnalysis.enabled,
      staticAnalysisQuick: staticAnalysis.useInQuickAnalysis,
      staticAnalysisArchitectural:
        staticAnalysis.useInArchitecturalAnalysis,
      staticAnalysisDiagnostics: staticAnalysis.includeDiagnostics,
      staticAnalysisRelations: staticAnalysis.includeSymbolRelations,
    };
  }

  private normalizeLocalEngineType(value: unknown): "cpu" | "cuda" | "vulkan" {
    if (value === "cuda" || value === "vulkan") {
      return value;
    }

    return "cpu";
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
