import {
  AtlasCloudChatResponse,
  AtlasCloudProviderKind,
  AtlasModelSummary,
  ChatMessage,
  ClaudeResponse,
  GeminiResponse,
  ModelsApiResponse,
  OpenAiCompatibleResponse,
  ProviderModelRaw,
} from "../interfaces/ApiTypes";
import { ApiKeyManager } from "../managers/ApiKeyManager";
import {
  AtlasConfigManager,
  ProviderConfig,
} from "../managers/AtlasConfigManager";

export class CloudApiService {
  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly apiKeyManager: ApiKeyManager,
  ) {}

  public async sendChat(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void, // <-- NOVO: Callback para Streaming
  ): Promise<AtlasCloudChatResponse> {
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

    const providerKind = this.getProviderKind(provider);

    switch (providerKind) {
      case "claude":
        return this.sendClaudeChat(
          provider,
          modelId,
          apiKey,
          messages,
          onChunk,
        );

      case "gemini":
        return this.sendGeminiChat(
          provider,
          modelId,
          apiKey,
          messages,
          onChunk,
        );

      case "openai-compatible":
      default:
        return this.sendOpenAiCompatibleChat(
          provider,
          modelId,
          apiKey,
          messages,
          config.llms.defaults.temperature,
          config.llms.defaults.maxTokens,
          config.llms.defaults.topP,
          onChunk,
        );
    }
  }

  private getProviderKind(provider: ProviderConfig): AtlasCloudProviderKind {
    if (provider.kind) {
      return provider.kind;
    }

    const normalized = provider.id.trim().toLowerCase();

    if (normalized.includes("claude") || normalized.includes("anthropic")) {
      return "claude";
    }

    if (normalized.includes("gemini") || normalized.includes("google")) {
      return "gemini";
    }

    return "openai-compatible";
  }

  private handleApiError(response: Response, data?: any): never {
    const status = response.status;
    const providerMessage =
      data?.error?.message ||
      data?.error?.details ||
      "Erro desconhecido retornado pelo provedor.";

    if (status === 401 || status === 403) {
      throw new Error(
        `Falha de autenticação (HTTP ${status}): Verifique sua chave de API. Detalhes: ${providerMessage}`,
      );
    }
    if (status === 429) {
      throw new Error(
        `Limite de requisições excedido (HTTP 429). Como estamos utilizando cotas gratuitas, tente novamente mais tarde. Detalhes: ${providerMessage}`,
      );
    }
    if (status >= 500) {
      throw new Error(
        `Indisponibilidade no provedor (HTTP ${status}). Serviço pode estar fora do ar. Detalhes: ${providerMessage}`,
      );
    }

    throw new Error(`Falha na requisição (HTTP ${status}): ${providerMessage}`);
  }

  private async fetchWithTimeout(
    resource: string,
    options: RequestInit & { timeout?: number },
  ): Promise<Response> {
    const timeoutSetting =
      this.configManager.getConfig().cloudSecurity?.timeout;
    const defaultTimeout = timeoutSetting ? timeoutSetting * 1000 : 30000;
    const timeout = options.timeout || defaultTimeout;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Timeout da requisição: O provedor não respondeu dentro de ${timeout / 1000} segundos.`,
        );
      }
      throw new Error(
        `Falha de rede ou comunicação: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
      );
    }
  }

  private async sendOpenAiCompatibleChat(
    provider: ProviderConfig,
    modelId: string,
    apiKey: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    topP: number,
    onChunk?: (chunk: string) => void,
  ): Promise<AtlasCloudChatResponse> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;

    const isStreaming = !!onChunk;

    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: isStreaming, // <-- NOVO: Ativa o stream se o callback existir
      }),
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {
        error: { message: "Resposta JSON inválida retornada pelo servidor." },
      };
    }

    if (!response.ok) {
      this.handleApiError(response, data);
    }

    // --- Lógica de Processamento de Stream (SSE) CORRIGIDA ---
    if (isStreaming && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullContent = "";
      let buffer = "";

      try {
        let isStreamFinished = false; // <-- NOVA FLAG

        while (!isStreamFinished) {
          // <-- PARA O LOOP SE RECEBER O [DONE]
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith("data: ")) continue;

            const dataStr = trimmedLine.slice(6).trim();
            if (dataStr === "[DONE]") {
              isStreamFinished = true; // <-- MARCA COMO TERMINADO
              break; // <-- QUEBRA O LOOP INTERNO
            }

            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.choices?.[0]?.delta?.content || "";
              if (textChunk) {
                fullContent += textChunk;
                if (onChunk) onChunk(textChunk);
              }
            } catch (e) {
              // Ignora erros de parse causados por chunks fragmentados
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        providerId: provider.id,
        providerLabel: provider.label,
        providerKind: "openai-compatible",
        modelId,
        content: fullContent,
        finishReason: "stop",
        usage: {},
        createdAt: new Date().toISOString(),
        raw: { stream: true },
      };
    }

    // Se não for streaming, continua com o comportamento antigo
    const data = (await response.json()) as OpenAiCompatibleResponse;
    return this.normalizeOpenAiCompatibleResponse(provider, modelId, data);
  }

  private async sendClaudeChat(
    provider: ProviderConfig,
    modelId: string,
    apiKey: string,
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
  ): Promise<AtlasCloudChatResponse> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/messages`;

    const systemMessages = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n")
      .trim();

    const nonSystemMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: this.configManager.getConfig().llms.defaults.maxTokens,
        temperature: this.configManager.getConfig().llms.defaults.temperature,
        system: systemMessages || undefined,
        messages: nonSystemMessages,
      }),
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {
        error: { message: "Resposta JSON inválida retornada pelo servidor." },
      };
    }

    if (!response.ok) {
      this.handleApiError(response, data);
    }

    const normalizedResponse = this.normalizeClaudeResponse(
      provider,
      modelId,
      data,
    );

    // --- NOVO: Fallback (modo não-streaming enviando tudo de uma vez) ---
    if (onChunk) {
      onChunk(normalizedResponse.content);
    }

    return normalizedResponse;
  }

  private async sendGeminiChat(
    provider: ProviderConfig,
    modelId: string,
    apiKey: string,
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
  ): Promise<AtlasCloudChatResponse> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemText = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n")
      .trim();

    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: systemText
          ? {
              parts: [{ text: systemText }],
            }
          : undefined,
        contents,
        generationConfig: {
          temperature: this.configManager.getConfig().llms.defaults.temperature,
          topP: this.configManager.getConfig().llms.defaults.topP,
          maxOutputTokens:
            this.configManager.getConfig().llms.defaults.maxTokens,
        },
      }),
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {
        error: { message: "Resposta JSON inválida retornada pelo servidor." },
      };
    }

    if (!response.ok) {
      this.handleApiError(response, data);
    }

    const normalizedResponse = this.normalizeGeminiResponse(
      provider,
      modelId,
      data,
    );

    if (onChunk) {
      onChunk(normalizedResponse.content);
    }

    return normalizedResponse;
  }

  private normalizeOpenAiCompatibleResponse(
    provider: ProviderConfig,
    modelId: string,
    data: OpenAiCompatibleResponse,
  ): AtlasCloudChatResponse {
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();

    if (!content) {
      throw new Error("O provedor retornou uma resposta vazia.");
    }

    const usageRaw = (data as any).usage;

    return {
      providerId: provider.id,
      providerLabel: provider.label,
      providerKind: "openai-compatible",
      modelId,
      content,
      finishReason: choice?.finish_reason,
      usage: {
        inputTokens:
          typeof usageRaw?.prompt_tokens === "number"
            ? usageRaw.prompt_tokens
            : undefined,
        outputTokens:
          typeof usageRaw?.completion_tokens === "number"
            ? usageRaw.completion_tokens
            : undefined,
        totalTokens:
          typeof usageRaw?.total_tokens === "number"
            ? usageRaw.total_tokens
            : undefined,
      },
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  private normalizeClaudeResponse(
    provider: ProviderConfig,
    modelId: string,
    data: ClaudeResponse,
  ): AtlasCloudChatResponse {
    const content = (data.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!content) {
      throw new Error("O provedor Claude retornou uma resposta vazia.");
    }

    const inputTokens = data.usage?.input_tokens;
    const outputTokens = data.usage?.output_tokens;

    return {
      providerId: provider.id,
      providerLabel: provider.label,
      providerKind: "claude",
      modelId,
      content,
      finishReason: data.stop_reason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens:
          typeof inputTokens === "number" && typeof outputTokens === "number"
            ? inputTokens + outputTokens
            : undefined,
      },
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  private normalizeGeminiResponse(
    provider: ProviderConfig,
    modelId: string,
    data: GeminiResponse,
  ): AtlasCloudChatResponse {
    const candidate = data.candidates?.[0];

    const content = (candidate?.content?.parts ?? [])
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!content) {
      throw new Error("O provedor Gemini retornou uma resposta vazia.");
    }

    return {
      providerId: provider.id,
      providerLabel: provider.label,
      providerKind: "gemini",
      modelId,
      content,
      finishReason: candidate?.finishReason,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
      createdAt: new Date().toISOString(),
      raw: data,
    };
  }

  public async getModelsForCurrentProvider(): Promise<AtlasModelSummary[]> {
    const providerId = this.configManager.getSelectedCloudProviderId();

    if (!providerId) {
      throw new Error("Nenhum provedor em nuvem foi selecionado.");
    }

    const provider = this.configManager.getProvider(providerId);

    if (!provider) {
      throw new Error(`Provedor "${providerId}" não encontrado.`);
    }

    const apiKey = await this.apiKeyManager.getRawKey(provider.id);

    if (!apiKey) {
      throw new Error(`API key não encontrada para "${provider.label}".`);
    }

    const providerKind = this.getProviderKind(provider);

    switch (providerKind) {
      case "claude":
      case "gemini":
        return this.getFallbackModelsForProvider(provider);

      case "openai-compatible":
      default:
        return this.getOpenAiCompatibleModels(provider, apiKey);
    }
  }

  private async getOpenAiCompatibleModels(
    provider: ProviderConfig,
    apiKey: string,
  ): Promise<AtlasModelSummary[]> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/models`;

    const response = await this.fetchWithTimeout(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    let json: any;
    try {
      json = await response.json();
    } catch {
      json = {
        error: { message: "Resposta JSON inválida retornada pelo servidor." },
      };
    }

    if (!response.ok) {
      this.handleApiError(response, json);
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

  private getFallbackModelsForProvider(
    provider: ProviderConfig,
  ): AtlasModelSummary[] {
    const providerName = provider.id.trim().toLowerCase();

    if (providerName.includes("claude") || providerName.includes("anthropic")) {
      return [
        {
          id: "claude-3-7-sonnet-latest",
          label: "claude-3-7-sonnet-latest",
          provider: provider.id,
        },
        {
          id: "claude-3-5-sonnet-latest",
          label: "claude-3-5-sonnet-latest",
          provider: provider.id,
        },
        {
          id: "claude-3-5-haiku-latest",
          label: "claude-3-5-haiku-latest",
          provider: provider.id,
        },
      ];
    }

    if (providerName.includes("gemini") || providerName.includes("google")) {
      return [
        {
          id: "gemini-2.5-pro",
          label: "gemini-2.5-pro",
          provider: provider.id,
        },
        {
          id: "gemini-2.5-flash",
          label: "gemini-2.5-flash",
          provider: provider.id,
        },
      ];
    }

    throw new Error(
      `Provedor "${provider.id}" não possui modelos configurados.`,
    );
  }
}
