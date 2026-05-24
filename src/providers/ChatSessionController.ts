import * as vscode from "vscode";

import { AtlasSession } from "../interfaces/AtlasHistoryTypes";
import {
  ActiveGenerationPayload,
  RouterDependencies,
} from "./ChatMessageRouterTypes";

export class ChatSessionController {
  constructor(
    private readonly deps: RouterDependencies,
    private readonly getActiveGeneration: () => ActiveGenerationPayload,
    private readonly postError: (
      webview: vscode.Webview,
      error: unknown,
      fallback: string,
    ) => Promise<void>,
  ) {}

  public async handleCreateSession(
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
          activeGeneration: this.getActiveGeneration(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao criar sessao.");
    }
  }

  public async handleSwitchSession(
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
          activeGeneration: this.getActiveGeneration(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao trocar sessao.");
    }
  }

  public async handleDeleteSession(
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
          activeGeneration: this.getActiveGeneration(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao excluir sessao.");
    }
  }

  public async handleRenameSession(
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

  public async handleListSessions(webview: vscode.Webview): Promise<void> {
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
          activeGeneration: this.getActiveGeneration(),
        },
      });
    } catch (error) {
      await this.postError(webview, error, "Erro ao listar sessoes.");
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
}
