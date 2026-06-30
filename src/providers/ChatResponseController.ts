import * as vscode from "vscode";

import { AtlasSession } from "../interfaces/AtlasHistoryTypes";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { RagContextSource } from "../interfaces/AtlasRagTypes";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import {
  ActiveGenerationPayload,
  ActiveResponseSnapshot,
  RouterDependencies,
} from "./ChatMessageRouterTypes";

export class ChatResponseController {
  private activeResponseController: AbortController | null = null;
  private activeResponseSnapshot: ActiveResponseSnapshot | null = null;

  constructor(
    private readonly deps: RouterDependencies,
    private readonly isViewingChatSession: (sessionId: string) => boolean,
  ) {}

  public async handleSendQuestion(
    data: any,
    webview: vscode.Webview,
  ): Promise<void> {
    this.activeResponseController?.abort();

    const responseController = new AbortController();
    this.activeResponseController = responseController;
    let responseSessionId: string | undefined;
    const generationId =
      typeof data.generationId === "string" && data.generationId.trim()
        ? data.generationId.trim()
        : undefined;
    const usesLocalEngine = this.deps.configManager.isLocalMode();

    try {
      const session = this.deps.sessionService.ensureActiveSession();
      responseSessionId = session.id;
      const config = this.deps.configManager.getConfig();
      const contextProfile = this.deps.configManager.getContextProfile();
      const requiresEditorContext =
        data.forcedMode === "architectural-analysis";
      const rawEditorContext = this.deps.getChatEditorContext();

      if (requiresEditorContext && !rawEditorContext) {
        throw new Error(
          "Abra um arquivo no editor antes de executar a análise arquitetural.",
        );
      }

      const editorContext =
        contextProfile.includeEditorContext || requiresEditorContext
        ? this.limitEditorContext(
            rawEditorContext,
            contextProfile.maxEditorContextCharacters,
          )
        : null;
      const windowMessages =
        this.deps.sessionService.getWindowMessages(
          session,
          contextProfile.historyWindowSize,
        );
      const localEngine = config.custom?.localEngine;
      const shouldStream = usesLocalEngine
        ? !(
            typeof localEngine === "object" &&
            localEngine !== null &&
            localEngine.stream === false
          )
        : config.llms.defaults.stream;

      const responseSnapshot: ActiveResponseSnapshot = {
        controller: responseController,
        sessionId: session.id,
        userContent: data.value,
        partialContent: "",
        isStreaming: shouldStream,
        generationId,
        usesLocalEngine,
        forcedMode:
          typeof data.forcedMode === "string" ? data.forcedMode : undefined,
      };

      this.activeResponseSnapshot = responseSnapshot;

      const baseAnalysisContext = editorContext
        ? [this.deps.buildEditorAnalysisContext(editorContext)]
        : [];

      let promptResult = this.deps.promptAssemblyService.buildMessages({
        userQuestion: data.value,
        history: windowMessages,
        analysisContext: baseAnalysisContext,
        ragContext: [],
        hasCodeContext: Boolean(editorContext),
        forcedMode: data.forcedMode,
        architecturalSummary: session.architecturalSummary || undefined,
        contextProfile,
      });

      if (promptResult.mode === "architectural-analysis" && !rawEditorContext) {
        throw new Error(
          "Nenhum arquivo válido aberto no editor para análise arquitetural.",
        );
      }

      let ragContext: string[] = [];
      let ragSources: RagContextSource[] = [];

      if (
        promptResult.mode !== "quick-analysis" &&
        config.rag.enabled === true &&
        contextProfile.includeRagContext
      ) {
        try {
          const retrieval = await this.deps.getRagContext(
            String(data.value ?? ""),
            responseController.signal,
          );
          ragContext = retrieval.context;
          ragSources = retrieval.sources;
        } catch (error) {
          if (
            AtlasInferenceService.isAbortError(error) ||
            responseController.signal.aborted
          ) {
            throw error;
          }

          console.warn(
            "[ATLAS] Recuperação RAG indisponível; continuando sem contexto:",
            error,
          );
        }

        if (ragContext.length) {
          console.log("[ATLAS RAG] Injetando contexto recuperado no prompt:", {
            chunks: ragContext.length,
            characters: ragContext.reduce(
              (total, item) => total + item.length,
              0,
            ),
            mode: promptResult.mode,
          });

          promptResult = this.deps.promptAssemblyService.buildMessages({
            userQuestion: data.value,
            history: windowMessages,
            analysisContext: baseAnalysisContext,
            ragContext,
            hasCodeContext: Boolean(editorContext),
            forcedMode: data.forcedMode,
            architecturalSummary: session.architecturalSummary || undefined,
            contextProfile,
          });
        } else {
          console.log(
            "[ATLAS RAG] Nenhum contexto recuperado será injetado no prompt.",
          );
        }
      }

      if (
        promptResult.mode === "architectural-analysis" &&
        editorContext &&
        this.deps.configManager.isStaticAnalysisEnabledFor(
          "architectural-analysis",
        )
      ) {
        const structureContext =
          await this.deps.buildDocumentStructureContext(editorContext.document);

        promptResult = this.deps.promptAssemblyService.buildMessages({
          userQuestion: data.value,
          history: windowMessages,
          analysisContext: [
            ...baseAnalysisContext,
            [
              "Estrutura estática coletada pelos provedores da linguagem no VS Code:",
              structureContext,
              "",
              "Use essa estrutura como evidência auxiliar. Não invente relações que não estejam presentes no código ou nos símbolos coletados.",
            ].join("\n"),
          ],
          ragContext,
          hasCodeContext: true,
          forcedMode: data.forcedMode,
          architecturalSummary: session.architecturalSummary || undefined,
          contextProfile,
        });
      }

      if (promptResult.mode === "quick-analysis") {
        await this.handleQuickAnalysisFromChat(
          session.id,
          String(data.value ?? ""),
          webview,
          responseController.signal,
        );
        return;
      }

      const response = shouldStream
        ? await this.deps.inferenceService.sendChat(
            promptResult.messages,
            async (chunk: string) => {
              if (responseController.signal.aborted) {
                return;
              }

              responseSnapshot.partialContent += chunk;
              await webview.postMessage({
                type: "respostaParcial",
                sessionId: session.id,
                generationId,
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

      this.throwIfAborted(responseController);

      await this.deps.sessionService.appendMessage(session.id, {
        role: "user",
        content: data.value,
      });

      await this.deps.sessionService.appendMessage(session.id, {
        role: "assistant",
        content: response.content,
        metadata: {
          ragSources: this.deps.configManager.getConfig().rag.showSources
            ? ragSources
            : [],
        },
      });

      this.deps.sessionService
        .summarizeIfNeeded(session.id, contextProfile.historyWindowSize)
        .catch((error) => {
          console.warn("[ATLAS] Background summarization error:", error);
        });

      if (!shouldStream) {
        await webview.postMessage({
          type: "novaResposta",
          sessionId: session.id,
          generationId,
          value: response.content,
          metadata: {
            ...this.buildResponseMetadata(promptResult.mode, response),
            sessionId: session.id,
            ragSources: this.deps.configManager.getConfig().rag.showSources
              ? ragSources
              : [],
          },
        });
      } else {
        await webview.postMessage({
          type: "fimResposta",
          sessionId: session.id,
          generationId,
          metadata: {
            ...this.buildResponseMetadata(promptResult.mode, response),
            sessionId: session.id,
            ragSources: this.deps.configManager.getConfig().rag.showSources
              ? ragSources
              : [],
          },
        });
      }

      await webview.postMessage({
        type: "sessoesAtualizadas",
        value: this.deps.sessionService.listSessions(),
      });

      await this.notifyResponseCompletedIfAway(session);
    } catch (error) {
      if (
        AtlasInferenceService.isAbortError(error) ||
        responseController.signal.aborted
      ) {
        await webview.postMessage({
          type: "geracaoCancelada",
          sessionId: responseSessionId,
          generationId,
        });
        return;
      }

      const message = this.getErrorMessage(error, "Erro ao enviar pergunta.");
      vscode.window.showErrorMessage(`ATLAS: ${message}`);

      await webview.postMessage({
        type: "erro",
        sessionId: this.activeResponseSnapshot?.sessionId,
        generationId,
        value: message,
      });
    } finally {
      if (this.activeResponseController === responseController) {
        this.activeResponseController = null;
      }

      if (this.activeResponseSnapshot?.controller === responseController) {
        this.activeResponseSnapshot = null;
      }
    }
  }

  public async handleCancelGeneration(webview: vscode.Webview): Promise<void> {
    const responseController = this.activeResponseController;
    const snapshot = this.activeResponseSnapshot;

    if (!responseController) {
      await webview.postMessage({
        type: "geracaoCancelada",
      });
      return;
    }

    responseController.abort();

    if (this.activeResponseController === responseController) {
      this.activeResponseController = null;
    }

    if (this.activeResponseSnapshot === snapshot) {
      this.activeResponseSnapshot = null;
    }

    await webview.postMessage({
      type: "geracaoCancelada",
      sessionId: snapshot?.sessionId,
      generationId: snapshot?.generationId,
    });
  }

  private async handleQuickAnalysisFromChat(
    sessionId: string,
    userContent: string,
    webview: vscode.Webview,
    signal: AbortSignal,
  ): Promise<void> {
    await this.deps.sessionService.appendMessage(sessionId, {
      role: "user",
      content: userContent,
    });

    await this.deps.executeQuickAnalysis(webview, {
      source: "chat",
      sessionId,
      signal,
    });

    await webview.postMessage({
      type: "sessoesAtualizadas",
      value: this.deps.sessionService.listSessions(),
    });
  }

  private limitEditorContext(
    editorContext: AtlasEditorContext | null,
    maxCharacters: number,
  ): AtlasEditorContext | null {
    if (!editorContext || editorContext.code.length <= maxCharacters) {
      return editorContext;
    }

    return {
      ...editorContext,
      code: this.truncateCodeContext(editorContext.code, maxCharacters),
      truncation: {
        originalCharacters: editorContext.code.length,
        maxCharacters,
      },
    };
  }

  private truncateCodeContext(code: string, maxCharacters: number): string {
    const marker = "\n\n/* ... conteúdo omitido pelo perfil de contexto ... */\n\n";
    const available = Math.max(0, maxCharacters - marker.length);

    if (available <= 0) {
      return code.slice(0, maxCharacters);
    }

    const headSize = Math.ceil(available * 0.65);
    const tailSize = available - headSize;

    return [
      code.slice(0, headSize).trimEnd(),
      marker.trimEnd(),
      code.slice(-tailSize).trimStart(),
    ].join("\n\n");
  }

  public serializeActiveGeneration(): ActiveGenerationPayload {
    if (!this.activeResponseSnapshot) {
      return null;
    }

    return {
      sessionId: this.activeResponseSnapshot.sessionId,
      userContent: this.activeResponseSnapshot.userContent,
      partialContent: this.activeResponseSnapshot.partialContent,
      isStreaming: this.activeResponseSnapshot.isStreaming,
      generationId: this.activeResponseSnapshot.generationId,
      forcedMode: this.activeResponseSnapshot.forcedMode,
    };
  }

  private async notifyResponseCompletedIfAway(
    session: AtlasSession,
  ): Promise<void> {
    if (this.isViewingChatSession(session.id)) {
      return;
    }

    const title = session.title?.trim() || "chat";
    const action = await vscode.window.showInformationMessage(
      `ATLAS: resposta concluída em "${title}".`,
      "Abrir chat",
    );

    if (action === "Abrir chat") {
      await this.deps.focusChatView();
    }
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

  private throwIfAborted(responseController: AbortController): void {
    if (!responseController.signal.aborted) {
      return;
    }

    const error = new Error("Geração cancelada pelo usuário.");
    error.name = "AbortError";
    throw error;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
