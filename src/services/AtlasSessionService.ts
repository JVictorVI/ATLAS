import { v4 as uuidv4 } from "uuid";
import { ChatMessage } from "../interfaces/ApiTypes";
import { AtlasSession, AtlasSessionSummary } from "../interfaces/AtlasHistoryTypes";
import { AtlasHistoryRepository } from "../repository/AtlasHistoryRepository";
import { CloudApiService } from "./CloudApiService";

const WINDOW_SIZE = 10;

const SUMMARIZATION_SYSTEM_PROMPT = `Você é um assistente técnico especializado em resumir histórico de conversas de arquitetura de software.

Sua tarefa é criar um resumo conciso e técnico das decisões arquiteturais discutidas nas mensagens fornecidas.

Foque em:
- Decisões de design identificadas
- Trade-offs discutidos
- Problemas arquiteturais detectados
- Padrões e princípios mencionados
- Conclusões técnicas alcançadas

Retorne APENAS o resumo técnico em texto corrido, sem marcações especiais.
O resumo deve ser escrito em português do Brasil e ser suficientemente detalhado para servir como contexto em conversas futuras.
Máximo de 400 palavras.`;

export class AtlasSessionService {
  private activeSessionId: string | null = null;

  constructor(
    private readonly historyRepository: AtlasHistoryRepository,
    private readonly cloudApiService: CloudApiService,
  ) {}

  // ── Session lifecycle ──────────────────────────────────────────────────────

  public createSession(title: string): AtlasSession {
    const now = new Date().toISOString();
    const session: AtlasSession = {
      id: uuidv4(),
      title: title.trim() || "Nova Sessão",
      architecturalSummary: "",
      messages: [],
      lastSummarizedIndex: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.historyRepository.saveSession(session);
    this.activeSessionId = session.id;
    return session;
  }

  public switchSession(sessionId: string): AtlasSession {
    const session = this.historyRepository.getSession(sessionId);
    if (!session) {
      throw new Error(`Sessão "${sessionId}" não encontrada.`);
    }
    this.activeSessionId = sessionId;
    return session;
  }

  public deleteSession(sessionId: string): void {
    this.historyRepository.deleteSession(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
  }

  public renameSession(sessionId: string, newTitle: string): AtlasSession {
    const session = this.historyRepository.getSession(sessionId);
    if (!session) {
      throw new Error(`Sessão "${sessionId}" não encontrada.`);
    }
    session.title = newTitle.trim() || session.title;
    session.updatedAt = new Date().toISOString();
    this.historyRepository.saveSession(session);
    return session;
  }

  // ── Active session ────────────────────────────────────────────────────────

  public getActiveSession(): AtlasSession | null {
    if (!this.activeSessionId) return null;
    return this.historyRepository.getSession(this.activeSessionId);
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public ensureActiveSession(): AtlasSession {
    if (!this.activeSessionId) {
      return this.createSession("Nova Sessão");
    }
    const session = this.historyRepository.getSession(this.activeSessionId);
    if (!session) {
      return this.createSession("Nova Sessão");
    }
    return session;
  }

  // ── Message management ────────────────────────────────────────────────────

  public appendMessage(sessionId: string, message: ChatMessage): AtlasSession {
    const session = this.historyRepository.getSession(sessionId);
    if (!session) throw new Error(`Sessão "${sessionId}" não encontrada.`);

    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    this.historyRepository.saveSession(session);
    return session;
  }

  /**
   * Returns the sliding-window messages to send to the API.
   * Always returns the last WINDOW_SIZE messages.
   */
  public getWindowMessages(session: AtlasSession): ChatMessage[] {
    const nonSystem = session.messages.filter((m) => m.role !== "system");
    return nonSystem.slice(-WINDOW_SIZE);
  }

  /**
   * Returns messages that are outside the current window and
   * have not yet been summarized (index > lastSummarizedIndex).
   */
  public getMessagesToSummarize(session: AtlasSession): ChatMessage[] {
    const nonSystem = session.messages.filter((m) => m.role !== "system");
    const archiveCutoff = Math.max(0, nonSystem.length - WINDOW_SIZE);

    if (archiveCutoff <= session.lastSummarizedIndex) {
      return [];
    }

    return nonSystem.slice(session.lastSummarizedIndex, archiveCutoff);
  }

  /**
   * Triggers summarization if there are archived messages waiting.
   * Updates architecturalSummary and lastSummarizedIndex in the session.
   */
  public async summarizeIfNeeded(sessionId: string): Promise<AtlasSession> {
    const session = this.historyRepository.getSession(sessionId);
    if (!session) throw new Error(`Sessão "${sessionId}" não encontrada.`);

    const toSummarize = this.getMessagesToSummarize(session);
    if (toSummarize.length === 0) return session;

    try {
      const conversationText = toSummarize
        .map((m) => `[${m.role === "user" ? "Usuário" : "ATLAS"}]: ${m.content}`)
        .join("\n\n");

      const previousContext = session.architecturalSummary
        ? `Resumo anterior:\n${session.architecturalSummary}\n\n`
        : "";

      const summaryMessages: ChatMessage[] = [
        { role: "system", content: SUMMARIZATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${previousContext}Novas mensagens para incluir no resumo:\n\n${conversationText}`,
        },
      ];

      const response = await this.cloudApiService.sendChat(summaryMessages);

      const nonSystem = session.messages.filter((m) => m.role !== "system");
      const archiveCutoff = Math.max(0, nonSystem.length - WINDOW_SIZE);

      session.architecturalSummary = response.content.trim();
      session.lastSummarizedIndex = archiveCutoff;
      session.updatedAt = new Date().toISOString();

      this.historyRepository.saveSession(session);

      console.log(
        `[ATLAS] Summarized ${toSummarize.length} messages for session "${session.title}". New lastSummarizedIndex: ${archiveCutoff}`,
      );
    } catch (error) {
      console.warn("[ATLAS] Summarization failed silently:", error);
    }

    return this.historyRepository.getSession(sessionId)!;
  }

  // ── Session list ───────────────────────────────────────────────────────────

  public listSessions(): AtlasSessionSummary[] {
    return this.historyRepository.getAllSessions().map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.filter((m) => m.role !== "system").length,
      hasArchitecturalSummary: s.architecturalSummary.length > 0,
    }));
  }
}