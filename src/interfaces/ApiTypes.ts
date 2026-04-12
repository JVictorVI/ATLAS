export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
  };
}

export interface ProviderModelRaw {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  active?: boolean;
  context_window?: number;
  max_completion_tokens?: number;

  [key: string]: unknown;
}

export interface AtlasModelSummary {
  id: string;
  label: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  raw?: unknown;
}

export interface ModelsApiResponse {
  data?: unknown;
  error?: {
    message?: string;
  };
}
