import { AtlasConfigManager } from "../services/AtlasConfigManager";
import { ApiKeyManager } from "../managers/ApiKeyManager";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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
    const activeModelId = config.llm.selection.cloud.modelId;

    if (!activeModelId) {
      throw new Error("Nenhum modelo ativo foi configurado.");
    }

    const model = this.configManager.getModel(activeModelId);

    if (!model) {
      throw new Error(`Modelo "${activeModelId}" não encontrado.`);
    }

    const provider = this.configManager
      .getAllProviders()
      .find((p) => p.id === model.provider);

    if (!provider) {
      throw new Error(`Provedor "${model.provider}" não encontrado.`);
    }

    const apiKey = await this.apiKeyManager.getRawKey(provider.id);

    if (!apiKey) {
      throw new Error(
        `Nenhuma chave cadastrada para o provedor "${provider.label}".`,
      );
    }

    const baseUrl = (model.baseUrl || provider.baseUrl).replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.apiModelName || model.name,
        messages,
        temperature:
          typeof model.parameters.temperature === "number"
            ? model.parameters.temperature
            : config.llm.defaults.temperature,
        max_tokens:
          typeof model.parameters.maxTokens === "number"
            ? model.parameters.maxTokens
            : config.llm.defaults.maxTokens,
        top_p:
          typeof model.parameters.topP === "number"
            ? model.parameters.topP
            : config.llm.defaults.topP,
        stream: false,
      }),
    });

    const data = (await response.json()) as OpenAiCompatibleResponse;

    if (!response.ok) {
      throw new Error(
        data.error?.message || `Erro na chamada HTTP: ${response.status}`,
      );
    }

    return data.choices?.[0]?.message?.content ?? "";
  }
}
