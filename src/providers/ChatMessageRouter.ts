import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ApiKeyManager } from "../managers/ApiKeyManager";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasSession } from "../interfaces/AtlasHistoryTypes";
import { CloudApiService } from "../services/CloudApiService";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import { AtlasSessionService } from "../services/AtlasSessionService";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";

type RouterDependencies = {
  apiKeyManager: ApiKeyManager;
  configManager: AtlasConfigManager;
  cloudApiService: CloudApiService;
  inferenceService: AtlasInferenceService;
  promptCustomizationService: AtlasPromptCustomizationService;
  promptAssemblyService: AtlasPromptAssemblyService;
  sessionService: AtlasSessionService;
  openPanel: (selectedView?: string) => void;
  sendModelsToWebview: (webview: vscode.Webview) => void;
  executeQuickAnalysis: (webview?: vscode.Webview) => Promise<void>;
  refreshLocalModels: () => ReturnType<AtlasConfigManager["getLocalModels"]>;
  promptStopLocalRuntime: () => Promise<void>;
  stopLocalRuntime: () => void;
  getLocalModelsDir: () => string;
  getChatEditorContext: () => AtlasEditorContext | null;
  buildEditorAnalysisContext: (context: AtlasEditorContext) => string;
};

export class ChatMessageRouter {
  private activeResponseController: AbortController | null = null;

  constructor(private readonly deps: RouterDependencies) {}

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
      case "enviarPergunta":
        await this.handleSendQuestion(data, webview);
        return;
      case "cancelarGeracao":
        await this.handleCancelGeneration(webview);
        return;
      case "abrirPainelConfig":
        this.deps.openPanel(data.selectedView);
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
        await this.handleCreateSession(data, webview);
        return;
      case "trocarSessao":
        await this.handleSwitchSession(data, webview);
        return;
      case "excluirSessao":
        await this.handleDeleteSession(data, webview);
        return;
      case "renomearSessao":
        await this.handleRenameSession(data, webview);
        return;
      case "listarSessoes":
        await this.handleListSessions(webview);
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

  private async handleSendQuestion(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    this.activeResponseController?.abort();
    const responseController = new AbortController();
    this.activeResponseController = responseController;

    try {
      const session = this.deps.sessionService.ensureActiveSession();
      const editorContext = this.deps.getChatEditorContext();
      const windowMessages =
        this.deps.sessionService.getWindowMessages(session);

      const promptResult = this.deps.promptAssemblyService.buildMessages({
        userQuestion: data.value,
        history: windowMessages,
        analysisContext: editorContext
          ? [this.deps.buildEditorAnalysisContext(editorContext)]
          : [],
        ragContext: [],
        hasCodeContext: Boolean(editorContext),
        forcedMode:
          data.forcedMode ??
          (editorContext?.source === "selection"
            ? "developer-assistant"
            : undefined),
        architecturalSummary: session.architecturalSummary || undefined,
      });

      const shouldStream =
        this.deps.configManager.getConfig().llms.defaults.stream;

      const response = shouldStream
        ? await this.deps.inferenceService.sendChat(
            promptResult.messages,
            async (chunk: string) => {
              await webview.postMessage({
                type: "respostaParcial",
                value: chunk,
              });
            },
            { signal: responseController.signal },
          )
        : await this.deps.inferenceService.sendChat(
            promptResult.messages,
            undefined,
            { signal: responseController.signal },
          );

      await this.deps.sessionService.appendMessage(session.id, {
        role: "user",
        content: data.value,
      });

      await this.deps.sessionService.appendMessage(session.id, {
        role: "assistant",
        content: response.content,
      });

      this.deps.sessionService.summarizeIfNeeded(session.id).catch((error) => {
        console.warn("[ATLAS] Background summarization error:", error);
      });

      if (!shouldStream) {
        await webview.postMessage({
          type: "novaResposta",
          value: response.content,
          metadata: {
            ...this.buildResponseMetadata(promptResult.mode, response),
            sessionId: session.id,
          },
        });
      } else {
        await webview.postMessage({
          type: "fimResposta",
          metadata: {
            ...this.buildResponseMetadata(promptResult.mode, response),
            sessionId: session.id,
          },
        });
      }

      await webview.postMessage({
        type: "sessoesAtualizadas",
        value: this.deps.sessionService.listSessions(),
      });
    } catch (error) {
      if (AtlasInferenceService.isAbortError(error)) {
        await webview.postMessage({
          type: "geracaoCancelada",
        });
        return;
      }

      await this.postError(webview, error, "Erro ao enviar pergunta.");
    } finally {
      if (this.activeResponseController === responseController) {
        this.activeResponseController = null;
      }
    }
  }

  private async handleCancelGeneration(webview: vscode.Webview): Promise<void> {
    if (!this.activeResponseController) {
      await webview.postMessage({
        type: "geracaoCancelada",
      });
      return;
    }

    this.activeResponseController.abort();
  }

  private async handleCreateSession(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const session = this.deps.sessionService.createSession(
        data.title ?? "Nova Sessao",
      );

      await webview.postMessage({
        type: "sessaoCriada",
        value: {
          session: this.serializeSessionForWebview(session),
          sessions: this.deps.sessionService.listSessions(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao criar sessao.");
    }
  }

  private async handleSwitchSession(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const session = this.deps.sessionService.switchSession(data.sessionId);

      await webview.postMessage({
        type: "sessaoTrocada",
        value: {
          session: this.serializeSessionForWebview(session),
          sessions: this.deps.sessionService.listSessions(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao trocar sessao.");
    }
  }

  private async handleDeleteSession(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      this.deps.sessionService.deleteSession(data.sessionId);

      const remaining = this.deps.sessionService.listSessions();
      const activeSession =
        remaining.length > 0
          ? this.deps.sessionService.switchSession(remaining[0].id)
          : null;

      await webview.postMessage({
        type: "sessaoExcluida",
        value: {
          deletedSessionId: data.sessionId,
          sessions: remaining,
          activeSession: activeSession
            ? this.serializeSessionForWebview(activeSession)
            : null,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao excluir sessao.");
    }
  }

  private async handleRenameSession(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      const session = this.deps.sessionService.renameSession(
        data.sessionId,
        data.newTitle,
      );

      await webview.postMessage({
        type: "sessaoRenomeada",
        value: {
          session: this.serializeSessionForWebview(session),
          sessions: this.deps.sessionService.listSessions(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao renomear sessao.");
    }
  }

  private async handleListSessions(webview: vscode.Webview): Promise<void> {
    try {
      const activeSession = this.deps.sessionService.getActiveSession();

      await webview.postMessage({
        type: "sessoesListadas",
        value: {
          sessions: this.deps.sessionService.listSessions(),
          activeSessionId: this.deps.sessionService.getActiveSessionId(),
          activeSession: activeSession
            ? this.serializeSessionForWebview(activeSession)
            : null,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao listar sessoes.");
    }
  }

  private async handleSelectMode(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      this.deps.configManager.setMode(data.mode);

      if (data.mode === "cloud") {
        await this.deps.promptStopLocalRuntime();
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
        confirmCloud,
        blockRag,
        limitPayload,
        maxTokens,
        timeout,
        temperature,
        topP,
        stream,
      } = data.payload ?? {};

      this.deps.configManager.updateSecuritySettings({
        confirmCloud,
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
          this.deps.stopLocalRuntime();
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
        this.deps.stopLocalRuntime();
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
      const runtimeType = this.normalizeLocalRuntimeType(payload.runtimeType);

      this.deps.configManager.updateCustomRoot({
        ...currentCustom,
        localRuntime: {
          runtimeType,
        },
      });

      this.deps.stopLocalRuntime();

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
        throw new Error("Modelo local invÃ¡lido.");
      }

      const model = this.deps.configManager.getLocalModel(modelId);

      if (!model) {
        throw new Error(`Modelo "${modelId}" nÃ£o encontrado.`);
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
        throw new Error(`Modelo "${modelId}" nÃ£o encontrado.`);
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
        this.deps.stopLocalRuntime();
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
        this.deps.stopLocalRuntime();
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
      await this.postError(webview, error, "Erro ao carregar modelos cloud.");
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
      await this.postError(webview, error, "Erro ao alterar modo estudo.");
    }
  }

  private serializeSessionForWebview(session: AtlasSession) {
    return {
      id: session.id,
      title: session.title,
      messages: session.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      hasArchitecturalSummary: session.architecturalSummary.length > 0,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private buildResponseMetadata(
    mode: string,
    response: Awaited<ReturnType<AtlasInferenceService["sendChat"]>>,
  ) {
    return {
      mode,
      providerId: response.providerId,
      providerKind: response.providerKind,
      modelId: response.modelId,
      finishReason: response.finishReason,
      usage: response.usage,
      createdAt: response.createdAt,
    };
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
    const localRuntime =
      this.deps.configManager.getConfig().custom?.localRuntime;

    if (typeof localRuntime !== "object" || localRuntime === null) {
      return {
        runtimeType: "cpu",
      };
    }

    const value = localRuntime as Record<string, unknown>;

    return {
      runtimeType: this.normalizeLocalRuntimeType(value.runtimeType),
    };
  }

  private normalizeLocalRuntimeType(value: unknown): "cpu" | "cuda" | "vulkan" {
    if (value === "cuda" || value === "vulkan") {
      return value;
    }

    return "cpu";
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
}
