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

export type AtlasCloudProviderKind = "openai-compatible" | "claude" | "gemini";

export interface AtlasTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AtlasChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AtlasCloudChatResponse {
  providerId: string;
  providerLabel: string;
  providerKind: AtlasCloudProviderKind;
  modelId: string;

  content: string;
  finishReason?: string;
  usage?: AtlasTokenUsage;

  createdAt: string;
  raw?: unknown;
}

export interface ClaudeResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
      role?: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
  };
}
