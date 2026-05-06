import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasHistoryStore, AtlasSession } from "../interfaces/AtlasHistoryTypes";

const HISTORY_VERSION = "1.0.0";

export class AtlasHistoryRepository {
  private readonly historyDirPath: string;
  private readonly historyFilePath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.historyDirPath = path.join(this.context.extensionPath, "config");
    this.historyFilePath = path.join(this.historyDirPath, "atlas-history.json");
  }

  public load(): AtlasHistoryStore {
    this.ensureHistoryFile();

    try {
      const raw = fs.readFileSync(this.historyFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AtlasHistoryStore>;
      return this.mergeWithDefaults(parsed);
    } catch {
      const fallback = this.createDefaultStore();
      this.save(fallback);
      return fallback;
    }
  }

  public save(store: AtlasHistoryStore): void {
    this.ensureHistoryDir();
    fs.writeFileSync(
      this.historyFilePath,
      JSON.stringify(store, null, 2),
      "utf8",
    );
  }

  public getSession(sessionId: string): AtlasSession | null {
    const store = this.load();
    return store.sessions.find((s) => s.id === sessionId) ?? null;
  }

  public saveSession(session: AtlasSession): void {
    const store = this.load();
    const index = store.sessions.findIndex((s) => s.id === session.id);

    if (index === -1) {
      store.sessions.unshift(session);
    } else {
      store.sessions[index] = session;
    }

    store.updatedAt = new Date().toISOString();
    this.save(store);
  }

  public deleteSession(sessionId: string): void {
    const store = this.load();
    store.sessions = store.sessions.filter((s) => s.id !== sessionId);
    store.updatedAt = new Date().toISOString();
    this.save(store);
  }

  public getAllSessions(): AtlasSession[] {
    return this.load().sessions;
  }

  private createDefaultStore(): AtlasHistoryStore {
    return {
      version: HISTORY_VERSION,
      updatedAt: new Date().toISOString(),
      sessions: [],
    };
  }

  private mergeWithDefaults(partial: Partial<AtlasHistoryStore>): AtlasHistoryStore {
    const defaults = this.createDefaultStore();
    return {
      version: partial.version ?? defaults.version,
      updatedAt: partial.updatedAt ?? defaults.updatedAt,
      sessions: Array.isArray(partial.sessions) ? partial.sessions : [],
    };
  }

  private ensureHistoryFile(): void {
    this.ensureHistoryDir();
    if (!fs.existsSync(this.historyFilePath)) {
      this.save(this.createDefaultStore());
    }
  }

  private ensureHistoryDir(): void {
    if (!fs.existsSync(this.historyDirPath)) {
      fs.mkdirSync(this.historyDirPath, { recursive: true });
    }
  }
}