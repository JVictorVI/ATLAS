import * as vscode from "vscode";
import { ApiKeyManager } from "../managers/ApiKeyManager";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { CloudApiService } from "../services/CloudApiService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasSessionService } from "../services/AtlasSessionService";

type EditorContext = {
  document: vscode.TextDocument;
  code: string;
  fileName: string;
  languageId: string;
  lineCount: number;
  source: "selection" | "document";
  selection?: {
    startLine: number;
    endLine: number;
  };
};

type RouterDependencies = {
  apiKeyManager: ApiKeyManager;
  configManager: AtlasConfigManager;
  cloudApiService: CloudApiService;

  promptCustomizationService: AtlasPromptCustomizationService;
  promptAssemblyService: AtlasPromptAssemblyService;
  sessionService: AtlasSessionService;

  openPanel: (selectedView?: string) => void;
  sendModelsToWebview: (webview: vscode.Webview) => void;
  executeQuickAnalysis: (webview?: vscode.Webview) => Promise<void>;
  getChatEditorContext: () => EditorContext | null;
  buildEditorAnalysisContext: (context: EditorContext) => string;
};

export class ChatMessageRouter {
  constructor(private readonly deps: RouterDependencies) {}

  public async handle(data: any, webview: vscode.Webview): Promise<void> {
    const handledByApiKeyManager = await this.deps.apiKeyManager.handleMessage(data, webview);
    if (handledByApiKeyManager) return;

    switch (data.type) {
      case "carregarLLMs":
        await this.handleLoadLlms(webview);
        return;
      case "enviarPergunta":
        await this.handleSendQuestion(data, webview);
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
      case "executarAnaliseRapida":
        await this.deps.executeQuickAnalysis(webview);
        return;

      // ── Session handlers ──────────────────────────────────────────────────
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

  // ── Session handlers ────────────────────────────────────────────────────────

  private async handleCreateSession(data: any, webview: vscode.Webview): Promise<void> {
    try {
      const session = this.deps.sessionService.createSession(data.title ?? "Nova Sessão");

      await webview.postMessage({
        type: "sessaoCriada",
        value: {
          session: this.serializeSessionForWebview(session),
          sessions: this.deps.sessionService.listSessions(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao criar sessão.");
    }
  }

  private async handleSwitchSession(data: any, webview: vscode.Webview): Promise<void> {
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
      await this.postError(webview, error, "Erro ao trocar sessão.");
    }
  }

  private async handleDeleteSession(data: any, webview: vscode.Webview): Promise<void> {
    try {
      this.deps.sessionService.deleteSession(data.sessionId);

      // After deletion, load the next available session or create a fresh one
      const remaining = this.deps.sessionService.listSessions();
      let activeSession = null;

      if (remaining.length > 0) {
        activeSession = this.deps.sessionService.switchSession(remaining[0].id);
      }

      await webview.postMessage({
        type: "sessaoExcluida",
        value: {
          deletedSessionId: data.sessionId,
          sessions: remaining,
          activeSession: activeSession ? this.serializeSessionForWebview(activeSession) : null,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao excluir sessão.");
    }
  }

  private async handleRenameSession(data: any, webview: vscode.Webview): Promise<void> {
    try {
      const session = this.deps.sessionService.renameSession(data.sessionId, data.newTitle);

      await webview.postMessage({
        type: "sessaoRenomeada",
        value: {
          session: this.serializeSessionForWebview(session),
          sessions: this.deps.sessionService.listSessions(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao renomear sessão.");
    }
  }

  private async handleListSessions(webview: vscode.Webview): Promise<void> {
    try {
      const sessions = this.deps.sessionService.listSessions();
      const activeSession = this.deps.sessionService.getActiveSession();

      await webview.postMessage({
        type: "sessoesListadas",
        value: {
          sessions,
          activeSessionId: this.deps.sessionService.getActiveSessionId(),
          activeSession: activeSession ? this.serializeSessionForWebview(activeSession) : null,
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao listar sessões.");
    }
  }

  private serializeSessionForWebview(session: any) {
    return {
      id: session.id,
      title: session.title,
      messages: session.messages
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({ role: m.role, content: m.content })),
      hasArchitecturalSummary: session.architecturalSummary?.length > 0,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  // ── Core chat handler ───────────────────────────────────────────────────────

  private async handleSendQuestion(data: any, webview: vscode.Webview): Promise<void> {
    try {
      const session = this.deps.sessionService.ensureActiveSession();
      const editorContext = this.deps.getChatEditorContext();

      // Get window-limited history for this session
      const windowMessages = this.deps.sessionService.getWindowMessages(session);

      const promptResult = this.deps.promptAssemblyService.buildMessages({
        userQuestion: data.value,
        history: windowMessages,
        analysisContext: editorContext
          ? [this.deps.buildEditorAnalysisContext(editorContext)]
          : [],
        ragContext: [],
        hasCodeContext: Boolean(editorContext),
        forcedMode:
          editorContext?.source === "selection" ? "developer-assistant" : undefined,
        architecturalSummary: session.architecturalSummary || undefined,
      });

      // Debug: log full payload for token monitoring (Step 3 of test plan)
      console.log("[ATLAS] Full API payload:", JSON.stringify(promptResult.messages, null, 2));

      const response = await this.deps.cloudApiService.sendChat(promptResult.messages);

      // Persist both the user question and bot response to history
      await this.deps.sessionService.appendMessage(session.id, {
        role: "user",
        content: data.value,
      });

      await this.deps.sessionService.appendMessage(session.id, {
        role: "assistant",
        content: response.content,
      });

      // Trigger summarization asynchronously (non-blocking)
      this.deps.sessionService.summarizeIfNeeded(session.id).catch((err) =>
        console.warn("[ATLAS] Background summarization error:", err),
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
          sessionId: session.id,
        },
      });

      // Notify webview of updated session summaries list
      await webview.postMessage({
        type: "sessoesAtualizadas",
        value: this.deps.sessionService.listSessions(),
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao enviar pergunta.");
    }
  }

  // ── Existing handlers (unchanged) ──────────────────────────────────────────

  private async handleLoadLlms(webview: vscode.Webview): Promise<void> {
    try {
      const providers = this.deps.configManager.getAllProviders();
      const localModels = this.deps.configManager.getLocalModels();

      await webview.postMessage({
        type: "informarLLMsCarregados",
        value: {
          selectedMode: this.deps.configManager.getCurrentMode(),
          selectedProviderId: this.deps.configManager.getSelectedCloudProviderId(),
          selectedCloudModelId: this.deps.configManager.getSelectedCloudModelId(),
          selectedLocalModelId: this.deps.configManager.getActiveLocalModel()?.id ?? null,
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

  private async handleSelectMode(data: any, webview: vscode.Webview): Promise<void> {
    try {
      this.deps.configManager.setMode(data.mode);
      await webview.postMessage({ type: "modoSelecionado", value: { mode: data.mode } });
    } catch (error) {
      await this.postError(webview, error, "Erro ao selecionar modo.");
    }
  }

  private async handleSaveSecuritySettings(data: any, webview: vscode.Webview): Promise<void> {
    try {
      const { confirmCloud, blockRag, limitPayload, maxTokens, timeout, temperature, topP } =
        data.payload ?? {};

      this.deps.configManager.updateSecuritySettings({ confirmCloud, blockRag, limitPayload, maxTokens, timeout });
      this.deps.configManager.updateLlmDefaults({ temperature, topP, maxTokens });

      const securitySettings = this.deps.configManager.getSection("cloudSecurity");
      const llmDefaults = this.deps.configManager.getConfig().llms.defaults;

      await webview.postMessage({
        type: "configuracoesSegurancaSalvas",
        value: { ...securitySettings, temperature: llmDefaults.temperature, topP: llmDefaults.topP },
      });

      vscode.window.showInformationMessage("Configurações de execução salvas.");
    } catch (error) {
      const message = this.getErrorMessage(error, "Erro desconhecido");
      await webview.postMessage({ type: "erro", value: message });
      vscode.window.showErrorMessage(`Erro ao salvar configurações: ${message}`);
    }
  }

  private async handleLoadSecuritySettings(webview: vscode.Webview): Promise<void> {
    try {
      const securitySettings = this.deps.configManager.getSection("cloudSecurity");
      const llmDefaults = this.deps.configManager.getConfig().llms.defaults;

      await webview.postMessage({
        type: "configuracoesSegurancaCarregadas",
        value: { ...securitySettings, temperature: llmDefaults.temperature, topP: llmDefaults.topP },
      });
    } catch (error) {
      const message = this.getErrorMessage(error, "Erro desconhecido");
      await webview.postMessage({ type: "erro", value: message });
      vscode.window.showErrorMessage(`Erro ao carregar configurações: ${message}`);
    }
  }

  private async handleSelectModel(data: any, webview: vscode.Webview): Promise<void> {
    try {
      if (data.mode === "local") {
        this.deps.configManager.setActiveLocalModel(data.modelId);
      } else if (data.mode === "cloud") {
        this.deps.configManager.setActiveCloudModel(data.modelId);
      }

      await webview.postMessage({
        type: "modeloSelecionado",
        value: { mode: data.mode, modelId: data.modelId },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao selecionar modelo.");
    }
  }

  private async handleLoadModelBehavior(webview: vscode.Webview): Promise<void> {
    try {
      const behavior = this.deps.promptCustomizationService.getBehaviorConfig();
      await webview.postMessage({ type: "comportamentoModeloCarregado", value: behavior });
    } catch (error) {
      await this.postError(webview, error, "Erro ao carregar comportamento do modelo.");
    }
  }

  private async handleSaveModelBehavior(data: any, webview: vscode.Webview): Promise<void> {
    try {
      const saved = this.deps.promptCustomizationService.saveBehaviorConfig(data.payload);
      await webview.postMessage({ type: "comportamentoModeloSalvo", value: saved });
      vscode.window.showInformationMessage("Comportamento do modelo salvo com sucesso.");
    } catch (error) {
      const message = this.getErrorMessage(error, "Erro ao salvar comportamento do modelo.");
      await webview.postMessage({ type: "erro", value: message });
      vscode.window.showErrorMessage(message);
    }
  }

  private async handleSelectCloudProvider(data: any, webview: vscode.Webview): Promise<void> {
    try {
      this.deps.configManager.setSelectedCloudProvider(data.providerId);
      const models = await this.deps.cloudApiService.getModelsForCurrentProvider();

      await webview.postMessage({
        type: "modelosCloudCarregados",
        value: {
          providerId: data.providerId,
          models: models.map((model) => ({ id: model.id, name: model.label || model.id })),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao carregar modelos cloud.");
    }
  }

  private async postError(webview: vscode.Webview, error: unknown, fallback: string): Promise<void> {
    await webview.postMessage({ type: "erro", value: this.getErrorMessage(error, fallback) });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}