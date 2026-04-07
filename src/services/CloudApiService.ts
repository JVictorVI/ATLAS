import { AtlasConfigManager } from "../services/AtlasConfigManager";
import { ApiKeyManager } from "../managers/ApiKeyManager";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAiCompatibleResponse {
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

interface ProviderModelRaw {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;

  // extensões (Groq, OpenRouter, etc.)
  active?: boolean;
  context_window?: number;
  max_completion_tokens?: number;

  [key: string]: unknown;
}

interface AtlasModelSummary {
  id: string;
  label: string;

  provider: string;

  contextWindow?: number;
  maxTokens?: number;

  raw?: unknown;
}

interface ModelsApiResponse {
  data?: unknown;
  error?: {
    message?: string;
  };
}

export class CloudApiService {
  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly apiKeyManager: ApiKeyManager,
  ) {}

  public async sendChat(messages: ChatMessage[]): Promise<string> {
    const config = this.configManager.getConfig();

    if (!this.configManager.isCloudMode()) {
      throw new Error(
        "O ATLAS não está configurado para execução em nuvem no momento.",
      );
    }

    const resolved = this.configManager.getResolvedCloudSelection();

    if (!resolved) {
      throw new Error(
        "A seleção em nuvem está incompleta. Defina o provedor e o modelo antes de enviar a mensagem.",
      );
    }

    const { provider, modelId } = resolved;
    const apiKey = await this.apiKeyManager.getRawKey(provider.id);

    if (!apiKey) {
      throw new Error(
        `Nenhuma chave cadastrada para o provedor "${provider.label}".`,
      );
    }

    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: config.llm.defaults.temperature,
        max_tokens: config.llm.defaults.maxTokens,
        top_p: config.llm.defaults.topP,
        stream: false,
      }),
    });

    const data = (await response.json()) as OpenAiCompatibleResponse;

    if (!response.ok) {
      throw new Error(
        data.error?.message || `Erro na chamada HTTP: ${response.status}`,
      );
    }

    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("O provedor retornou uma resposta vazia.");
    }

    return content;
  }

  public async getModelsForCurrentProvider(): Promise<AtlasModelSummary[]> {
    const resolved = this.configManager.getResolvedCloudSelection();

    if (!resolved) {
      throw new Error("Seleção em nuvem incompleta.");
    }

    const { provider } = resolved;

    const apiKey = await this.apiKeyManager.getRawKey(provider.id);

    if (!apiKey) {
      throw new Error(`API key não encontrada para "${provider.label}".`);
    }

    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/models`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const json = (await response.json()) as ModelsApiResponse;

    if (!response.ok) {
      throw new Error(json.error?.message || `Erro HTTP ${response.status}`);
    }

    if (!Array.isArray(json.data)) {
      throw new Error("Formato inesperado ao listar modelos.");
    }

    const models = json.data as ProviderModelRaw[];

    return models.map((model) => ({
      id: model.id,
      label: model.id,
      provider: provider.id,
      contextWindow:
        typeof model.context_window === "number"
          ? model.context_window
          : undefined,
      maxTokens:
        typeof model.max_completion_tokens === "number"
          ? model.max_completion_tokens
          : undefined,
      raw: model,
    }));
  }
}
