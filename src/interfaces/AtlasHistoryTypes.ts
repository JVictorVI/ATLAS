import { ChatMessage } from "./ApiTypes";

export interface AtlasSession {
  id: string;
  title: string;
  architecturalSummary: string;
  messages: ChatMessage[];
  lastSummarizedIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasHistoryStore {
  version: string;
  updatedAt: string;
  sessions: AtlasSession[];
}

export type AtlasSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  hasArchitecturalSummary: boolean;
};