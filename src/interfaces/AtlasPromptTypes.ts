import { ChatMessage } from "./ApiTypes";

export type AtlasPromptAssemblyInput = {
  userQuestion: string;
  history?: ChatMessage[];
  analysisContext?: string[];
  ragContext?: string[];
  hasCodeContext?: boolean;
  forcedMode?: AtlasPromptMode;
  /** Long-term architectural memory injected from the active session */
  architecturalSummary?: string;
};

export type AtlasPromptAssemblyResult = {
  mode: AtlasPromptMode;
  messages: ChatMessage[];
};

export type AtlasUserBehaviorMode = "default" | "custom";

export type AtlasUserBehaviorConfig = {
  mode: AtlasUserBehaviorMode;
  enabled: boolean;
  customInstructions: string;
};

export type AtlasPromptMode =
  | "architectural-analysis"
  | "developer-assistant"
  | "quick-analysis";

export type AtlasPromptModeResolverInput = {
  userQuestion: string;
  hasCodeContext?: boolean;
  hasAnalysisContext?: boolean;
  hasRagContext?: boolean;
  forcedMode?: AtlasPromptMode;
};