import * as vscode from "vscode";

import { AtlasSession } from "../interfaces/AtlasHistoryTypes";
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

    try {
      const session = this.deps.sessionService.ensureActiveSession();
      responseSessionId = session.id;
      const editorContext = this.deps.getChatEditorContext();
      const windowMessages =
        this.deps.sessionService.getWindowMessages(session);
      const shouldStream =
        this.deps.configManager.getConfig().llms.defaults.stream;

      const responseSnapshot: ActiveResponseSnapshot = {
        controller: responseController,
        sessionId: session.id,
        userContent: data.value,
        partialContent: "",
        isStreaming: shouldStream,
      };

      this.activeResponseSnapshot = responseSnapshot;

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

      if (promptResult.mode === "quick-analysis") {
        await this.handleQuickAnalysisFromChat(
          session.id,
          String(data.value ?? ""),
          webview,
        );
        return;
      }

      const response = shouldStream
        ? await this.deps.inferenceService.sendChat(
            promptResult.messages,
            async (chunk: string) => {
              responseSnapshot.partialContent += chunk;
              await webview.postMessage({
                type: "respostaParcial",
                sessionId: session.id,
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
          sessionId: session.id,
          value: response.content,
          metadata: {
            ...this.buildResponseMetadata(promptResult.mode, response),
            sessionId: session.id,
          },
        });
      } else {
        await webview.postMessage({
          type: "fimResposta",
          sessionId: session.id,
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

      await this.notifyResponseCompletedIfAway(session);
    } catch (error) {
      if (
        AtlasInferenceService.isAbortError(error) ||
        responseController.signal.aborted
      ) {
        await webview.postMessage({
          type: "geracaoCancelada",
          sessionId: responseSessionId,
        });
        return;
      }

      const message = this.getErrorMessage(error, "Erro ao enviar pergunta.");
      vscode.window.showErrorMessage(`ATLAS: ${message}`);

      await webview.postMessage({
        type: "erro",
        sessionId: this.activeResponseSnapshot?.sessionId,
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
    if (!this.activeResponseController) {
      await webview.postMessage({
        type: "geracaoCancelada",
      });
      return;
    }

    this.activeResponseController.abort();
  }

  private async handleQuickAnalysisFromChat(
    sessionId: string,
    userContent: string,
    webview: vscode.Webview,
  ): Promise<void> {
    await this.deps.sessionService.appendMessage(sessionId, {
      role: "user",
      content: userContent,
    });

    await this.deps.executeQuickAnalysis(webview, {
      source: "chat",
      sessionId,
    });

    await webview.postMessage({
      type: "sessoesAtualizadas",
      value: this.deps.sessionService.listSessions(),
    });
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

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
