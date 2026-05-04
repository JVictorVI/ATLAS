import * as vscode from "vscode";
import { ApiKeyManager } from "../managers/ApiKeyManager";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { CloudApiService } from "../services/CloudApiService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";

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
  openPanel: (selectedView?: string) => void;
  sendModelsToWebview: (webview: vscode.Webview) => void;
  executeQuickAnalysis: (webview?: vscode.Webview) => Promise<void>;
  getChatEditorContext: () => EditorContext | null;
  buildEditorAnalysisContext: (context: EditorContext) => string;
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

    if (data.type === "carregarLLMs") {
      await this.handleLoadLlms(webview);
      return;
    }

    if (data.type === "enviarPergunta") {
      await this.handleSendQuestion(data, webview);
      return;
    }

    if (data.type === "cancelarGeracao") {
      await this.handleCancelGeneration(webview);
      return;
    }

    if (data.type === "abrirPainelConfig") {
      this.deps.openPanel(data.selectedView);
      return;
    }

    if (data.type === "selecionarModo") {
      await this.handleSelectMode(data, webview);
      return;
    }

    if (data.type === "salvarConfiguracoesSeguranca") {
      await this.handleSaveSecuritySettings(data, webview);
      return;
    }

    if (data.type === "carregarConfiguracoesSeguranca") {
      await this.handleLoadSecuritySettings(webview);
      return;
    }

    if (data.type === "selecionarModelo") {
      await this.handleSelectModel(data, webview);
      return;
    }

    if (data.type === "carregarComportamentoModelo") {
      await this.handleLoadModelBehavior(webview);
      return;
    }

    if (data.type === "salvarComportamentoModelo") {
      await this.handleSaveModelBehavior(data, webview);
      return;
    }

    if (data.type === "selecionarProviderCloud") {
      await this.handleSelectCloudProvider(data, webview);
      return;
    }

    if (data.type === "requestModels") {
      this.deps.sendModelsToWebview(webview);
      return;
    }

    if (data.type === "executarAnaliseRapida") {
      await this.deps.executeQuickAnalysis(webview);
    }

    if (data.type === "alterarModoEstudo") {
      await this.handleToggleStudyMode(data, webview);
      return;
    }
  }

  private async handleLoadLlms(webview: vscode.Webview): Promise<void> {
    try {
      const providers = this.deps.configManager.getAllProviders();
      const localModels = this.deps.configManager.getLocalModels();

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
      const editorContext = this.deps.getChatEditorContext();

      const promptResult = this.deps.promptAssemblyService.buildMessages({
        userQuestion: data.value,
        history: [],
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
      });


      const response = shouldStream
        ? await this.deps.cloudApiService.sendChat(
            promptResult.messages,
            async (chunk: string) => {
              await webview.postMessage({
                type: "respostaParcial",
                value: chunk,
              });
            },
            { signal: responseController.signal },
          )
        : await this.deps.cloudApiService.sendChat(
            promptResult.messages,
            undefined,
            { signal: responseController.signal },
          );


      await webview.postMessage({
        type: "fimResposta",
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
    } catch (error) {
      if (CloudApiService.isAbortError(error)) {
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

  private async handleSelectMode(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      this.deps.configManager.setMode(data.mode);

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

  private async postError(
    webview: vscode.Webview,
    error: unknown,
    fallback: string,
  ): Promise<void> {
    await webview.postMessage({
      type: "erro",
      value: this.getErrorMessage(error, fallback),
    });
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
}
