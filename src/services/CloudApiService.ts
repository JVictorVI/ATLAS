import {
  AtlasCloudChatResponse,
  AtlasCloudProviderKind,
  AtlasChatMessage,
  AtlasModelSummary,
  ChatMessage,
  ClaudeModelRaw,
  ClaudeModelsApiResponse,
  ClaudeResponse,
  GeminiModelRaw,
  GeminiModelsApiResponse,
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
  private readonly cloudMaxTokensCache = new Map<string, number | null>();
  private readonly openAiOutputTokenParameterCache = new Map<
    string,
    "max_tokens" | "max_completion_tokens"
  >();

  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly apiKeyManager: ApiKeyManager,
  ) {}

  public async sendChat(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    options?: { signal?: AbortSignal },
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
    const cloudConfigs = config.cloudConfigs;
    const sendsOnlyRequiredParameters =
      cloudConfigs.sendOnlyRequiredParameters === true;
    const limitsOutputTokens =
      cloudConfigs.limitPayload === true && !sendsOnlyRequiredParameters;
    const maxTokens = limitsOutputTokens
      ? await this.resolveCloudMaxTokens(
          provider,
          modelId,
          apiKey,
          cloudConfigs.maxTokens,
        )
      : undefined;

    switch (providerKind) {
      case "claude":
        return this.sendClaudeChat(
          provider,
          modelId,
          apiKey,
          messages,
          maxTokens,
          cloudConfigs.temperature,
          cloudConfigs.topP,
          sendsOnlyRequiredParameters,
          onChunk,
          options?.signal,
        );

      case "gemini":
        return this.sendGeminiChat(
          provider,
          modelId,
          apiKey,
          messages,
          maxTokens,
          cloudConfigs.temperature,
          cloudConfigs.topP,
          sendsOnlyRequiredParameters,
          onChunk,
          options?.signal,
        );

      case "openai-compatible":
      default:
        return this.sendOpenAiCompatibleChat(
          provider,
          modelId,
          apiKey,
          messages,
          cloudConfigs.temperature,
          maxTokens,
          cloudConfigs.topP,
          sendsOnlyRequiredParameters,
          onChunk,
          options?.signal,
        );
    }
  }

  public static isAbortError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    );
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
    const providerMessage = this.getProviderErrorMessage(data);

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

  private getProviderErrorMessage(data?: any): string {
    return (
      data?.error?.message ||
      data?.error?.details ||
      data?.message ||
      "Erro desconhecido retornado pelo provedor."
    );
  }

  private async fetchWithTimeout(
    resource: string,
    options: RequestInit & { timeout?: number; signal?: AbortSignal },
  ): Promise<Response> {
    const timeoutSetting = this.configManager.getConfig().cloudConfigs.timeout;
    const defaultTimeout = timeoutSetting ? timeoutSetting * 1000 : 30000;
    const timeout = options.timeout || defaultTimeout;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const abortFromCaller = () => controller.abort();

    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener("abort", abortFromCaller, {
        once: true,
      });
    }

    try {
      const { timeout: _timeout, signal: _signal, ...fetchOptions } = options;
      const response = await fetch(resource, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);

      if (error instanceof Error && error.name === "AbortError") {
        if (options.signal?.aborted) {
          throw error;
        }

        throw new Error(
          `Timeout da requisição: O provedor não respondeu dentro de ${timeout / 1000} segundos.`,
        );
      }

      throw new Error(
        `Falha de rede ou comunicação: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`,
      );
    } finally {
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async safeReadJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return {
        error: {
          message: "Resposta JSON inválida retornada pelo servidor.",
        },
      };
    }
  }

  private async sendOpenAiCompatibleChat(
    provider: ProviderConfig,
    modelId: string,
    apiKey: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number | undefined,
    topP: number,
    sendsOnlyRequiredParameters: boolean,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AtlasCloudChatResponse> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;
    const requestedStreaming =
      !sendsOnlyRequiredParameters && typeof onChunk === "function";
    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages: this.toProviderMessages(messages),
    };

    if (!sendsOnlyRequiredParameters) {
      requestBody.temperature = temperature;
      requestBody.top_p = topP;
      requestBody.stream = requestedStreaming;

      if (maxTokens !== undefined) {
        requestBody[this.getOpenAiOutputTokenParameter(provider, modelId)] =
          maxTokens;
      }
    }

    const { response, isStreaming } =
      await this.sendOpenAiCompatibleRequest(
        endpoint,
        apiKey,
        provider,
        modelId,
        requestBody,
        signal,
      );

    // --- Lógica de Processamento de Stream (SSE) CORRIGIDA ---
    if (isStreaming) {
      if (!response.body) {
        throw new Error(
          "O provedor não retornou um corpo de resposta para streaming.",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullContent = "";
      let buffer = "";
      let finishReason: string | undefined;
      let abortRequested = signal?.aborted === true;

      const abortStream = () => {
        abortRequested = true;
        void reader.cancel().catch(() => undefined);
      };

      if (abortRequested) {
        throw this.createAbortError();
      }

      signal?.addEventListener("abort", abortStream, { once: true });

      try {
        let isStreamFinished = false;

        while (!isStreamFinished) {
          if (abortRequested) {
            throw this.createAbortError();
          }

          const { done, value } = await reader.read();

          if (abortRequested) {
            throw this.createAbortError();
          }

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith("data: ")) {
              continue;
            }

            const dataStr = trimmedLine.slice(6).trim();
            if (!dataStr) {
              continue;
            }

            if (dataStr === "[DONE]") {
              isStreamFinished = true;
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed?.choices?.[0];
              const textChunk = choice?.delta?.content || "";

              if (typeof choice?.finish_reason === "string") {
                finishReason = choice.finish_reason;
              }

              if (textChunk) {
                fullContent += textChunk;
                onChunk?.(textChunk);
              }
            } catch {
              // Ignora fragmentos incompletos/parciais do SSE.
            }
          }
        }
      } finally {
        signal?.removeEventListener("abort", abortStream);
        reader.releaseLock();
      }

      if (!fullContent.trim()) {
        throw new Error("O provedor retornou uma resposta vazia.");
      }

      return {
        providerId: provider.id,
        providerLabel: provider.label,
        providerKind: "openai-compatible",
        modelId,
        content: fullContent,
        finishReason: finishReason ?? "stop",
        usage: undefined,
        createdAt: new Date().toISOString(),
        raw: { stream: isStreaming },
      };
    }

    // Se não for streaming, continua com o comportamento antigo
    this.throwIfAborted(signal);

    const data = (await this.safeReadJson(
      response,
    )) as OpenAiCompatibleResponse;

    this.throwIfAborted(signal);

    const normalizedResponse = this.normalizeOpenAiCompatibleResponse(
      provider,
      modelId,
      data,
    );

    this.throwIfAborted(signal);

    if (onChunk) {
      onChunk(normalizedResponse.content);
    }

    return normalizedResponse;
  }

  private async sendOpenAiCompatibleRequest(
    endpoint: string,
    apiKey: string,
    provider: ProviderConfig,
    modelId: string,
    requestBody: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ response: Response; isStreaming: boolean }> {
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await this.fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (response.ok) {
        return {
          response,
          isStreaming: requestBody.stream === true,
        };
      }

      const errorData = await this.safeReadJson(response);

      if (
        response.status === 400 &&
        this.adaptOpenAiCompatibleRequest(
          provider,
          modelId,
          requestBody,
          errorData,
        )
      ) {
        continue;
      }

      this.handleApiError(response, errorData);
    }

    throw new Error(
      "O provedor rejeitou repetidamente os parâmetros de compatibilidade da requisição.",
    );
  }

  private adaptOpenAiCompatibleRequest(
    provider: ProviderConfig,
    modelId: string,
    requestBody: Record<string, unknown>,
    errorData: unknown,
  ): boolean {
    const message = this.getProviderErrorMessage(errorData);
    const replacement = message.match(
      /unsupported parameter:\s*['`"]([^'`"]+)['`"][\s\S]*?use\s*['`"]([^'`"]+)['`"]\s*instead/i,
    );

    if (replacement) {
      const [, unsupportedParameter, replacementParameter] = replacement;

      if (
        this.isOptionalOpenAiParameter(unsupportedParameter) &&
        this.isOptionalOpenAiParameter(replacementParameter) &&
        unsupportedParameter in requestBody
      ) {
        const value = requestBody[unsupportedParameter];
        delete requestBody[unsupportedParameter];
        requestBody[replacementParameter] = value;
        this.rememberOpenAiOutputTokenParameter(
          provider,
          modelId,
          replacementParameter,
        );
        return true;
      }
    }

    const unsupportedParameter = message.match(
      /unsupported parameter:\s*['`"]([^'`"]+)['`"]|parameter\s*['`"]([^'`"]+)['`"].*?(?:not supported|unsupported)/i,
    );
    const parameterName = unsupportedParameter?.[1] ?? unsupportedParameter?.[2];

    if (
      parameterName &&
      this.isOptionalOpenAiParameter(parameterName) &&
      parameterName in requestBody
    ) {
      delete requestBody[parameterName];
      return true;
    }

    if (
      "temperature" in requestBody &&
      /(?:unsupported value|does not support|only the default).*temperature|temperature.*(?:unsupported value|does not support|only the default)/i.test(
        message,
      )
    ) {
      delete requestBody.temperature;
      return true;
    }

    return false;
  }

  private isOptionalOpenAiParameter(parameter: string): boolean {
    return [
      "max_tokens",
      "max_completion_tokens",
      "temperature",
      "top_p",
      "stream",
    ].includes(parameter);
  }

  private getOpenAiOutputTokenParameter(
    provider: ProviderConfig,
    modelId: string,
  ): "max_tokens" | "max_completion_tokens" {
    return (
      this.openAiOutputTokenParameterCache.get(
        this.getOpenAiModelCacheKey(provider, modelId),
      ) ?? "max_tokens"
    );
  }

  private rememberOpenAiOutputTokenParameter(
    provider: ProviderConfig,
    modelId: string,
    parameter: string,
  ): void {
    if (parameter !== "max_tokens" && parameter !== "max_completion_tokens") {
      return;
    }

    this.openAiOutputTokenParameterCache.set(
      this.getOpenAiModelCacheKey(provider, modelId),
      parameter,
    );
  }

  private getOpenAiModelCacheKey(
    provider: ProviderConfig,
    modelId: string,
  ): string {
    return `${provider.id}::${modelId}`;
  }

  private createAbortError(): Error {
    const error = new Error("Geração em nuvem cancelada pelo usuário.");
    error.name = "AbortError";
    return error;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw this.createAbortError();
  }

  private toProviderMessages(messages: ChatMessage[]): AtlasChatMessage[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private async resolveCloudMaxTokens(
    provider: ProviderConfig,
    modelId: string,
    apiKey: string,
    configuredMaxTokens: number,
  ): Promise<number> {
    const fallback = this.normalizePositiveInteger(configuredMaxTokens, 2048);

    if (this.configManager.getConfig().cloudConfigs.dynamicMaxTokens !== true) {
      return fallback;
    }

    const cacheKey = `${provider.id}::${modelId}`;

    if (!this.cloudMaxTokensCache.has(cacheKey)) {
      try {
        const models = await this.getModelsForProvider(provider, apiKey);
        const selectedModel = models.find(
          (model) => model.id === modelId || model.label === modelId,
        );
        const maxTokens =
          typeof selectedModel?.maxTokens === "number" &&
          Number.isFinite(selectedModel.maxTokens) &&
          selectedModel.maxTokens > 0
            ? Math.floor(selectedModel.maxTokens)
            : null;

        this.cloudMaxTokensCache.set(cacheKey, maxTokens);
      } catch {
        this.cloudMaxTokensCache.set(cacheKey, null);
      }
    }

    return this.cloudMaxTokensCache.get(cacheKey) ?? fallback;
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized <= 0) {
      return fallback;
    }

    return Math.floor(normalized);
  }

  private async sendClaudeChat(
    provider: ProviderConfig,
    modelId: string,
    apiKey: string,
    messages: ChatMessage[],
    maxTokens: number | undefined,
    temperature: number,
    topP: number,
    sendsOnlyRequiredParameters: boolean,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AtlasCloudChatResponse> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/messages`;
    const requestedStreaming =
      !sendsOnlyRequiredParameters && typeof onChunk === "function";

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

    const requestBody: Record<string, unknown> = {
      model: modelId,
      // A API Claude exige esse campo mesmo quando o limite opcional está
      // desativado ou o modo de compatibilidade está ativo.
      max_tokens:
        maxTokens ??
        this.normalizePositiveInteger(
          this.configManager.getConfig().cloudConfigs.maxTokens,
          2048,
        ),
      system: systemMessages || undefined,
      messages: nonSystemMessages,
    };

    if (!sendsOnlyRequiredParameters) {
      requestBody.temperature = temperature;
      requestBody.top_p = topP;
      requestBody.stream = requestedStreaming;
    }

    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: requestedStreaming ? "text/event-stream" : "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    this.throwIfAborted(signal);

    if (!response.ok) {
      const errorData = await this.safeReadJson(response);
      this.handleApiError(response, errorData);
    }

    if (requestedStreaming) {
      return this.readClaudeStreamingResponse(
        response,
        provider,
        modelId,
        onChunk,
        signal,
      );
    }

    const data = (await this.safeReadJson(response)) as ClaudeResponse;

    this.throwIfAborted(signal);

    const normalizedResponse = this.normalizeClaudeResponse(
      provider,
      modelId,
      data,
    );

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
    maxTokens: number | undefined,
    temperature: number,
    topP: number,
    sendsOnlyRequiredParameters: boolean,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AtlasCloudChatResponse> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const requestedStreaming =
      !sendsOnlyRequiredParameters && typeof onChunk === "function";
    const method = requestedStreaming
      ? "streamGenerateContent"
      : "generateContent";
    const query = new URLSearchParams({ key: apiKey });

    if (requestedStreaming) {
      query.set("alt", "sse");
    }

    const endpoint = `${baseUrl}/models/${encodeURIComponent(
      modelId,
    )}:${method}?${query.toString()}`;

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

    const requestBody: Record<string, unknown> = {
      systemInstruction: systemText
        ? {
            parts: [{ text: systemText }],
          }
        : undefined,
      contents,
    };

    if (!sendsOnlyRequiredParameters) {
      const generationConfig: Record<string, unknown> = {
        temperature,
        topP,
      };

      if (maxTokens !== undefined) {
        generationConfig.maxOutputTokens = maxTokens;
      }

      requestBody.generationConfig = generationConfig;
    }

    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: requestedStreaming ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    this.throwIfAborted(signal);

    if (!response.ok) {
      const errorData = await this.safeReadJson(response);
      this.handleApiError(response, errorData);
    }

    if (requestedStreaming) {
      return this.readGeminiStreamingResponse(
        response,
        provider,
        modelId,
        onChunk,
        signal,
      );
    }

    const data = (await this.safeReadJson(response)) as GeminiResponse;

    this.throwIfAborted(signal);

    const normalizedResponse = this.normalizeGeminiResponse(
      provider,
      modelId,
      data,
    );

    this.throwIfAborted(signal);

    if (onChunk) {
      onChunk(normalizedResponse.content);
    }

    return normalizedResponse;
  }

  private async readClaudeStreamingResponse(
    response: Response,
    provider: ProviderConfig,
    modelId: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AtlasCloudChatResponse> {
    let content = "";
    let finishReason: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    await this.readJsonSse(response, signal, (event) => {
      if (event?.type === "error") {
        throw new Error(
          event?.error?.message ||
            "O provedor Claude encerrou o streaming com erro.",
        );
      }

      if (event?.type === "message_start") {
        inputTokens = event?.message?.usage?.input_tokens;
        outputTokens = event?.message?.usage?.output_tokens;
      }

      const startedText =
        event?.type === "content_block_start" &&
        event?.content_block?.type === "text"
          ? event.content_block.text
          : undefined;
      const deltaText =
        event?.type === "content_block_delta" &&
        event?.delta?.type === "text_delta"
          ? event.delta.text
          : undefined;
      const textChunk =
        typeof deltaText === "string"
          ? deltaText
          : typeof startedText === "string"
            ? startedText
            : "";

      if (textChunk) {
        content += textChunk;
        onChunk?.(textChunk);
      }

      if (event?.type === "message_delta") {
        if (typeof event?.delta?.stop_reason === "string") {
          finishReason = event.delta.stop_reason;
        }

        if (typeof event?.usage?.output_tokens === "number") {
          outputTokens = event.usage.output_tokens;
        }
      }
    });

    if (!content.trim()) {
      throw new Error("O provedor Claude retornou uma resposta vazia.");
    }

    return {
      providerId: provider.id,
      providerLabel: provider.label,
      providerKind: "claude",
      modelId,
      content,
      finishReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens:
          typeof inputTokens === "number" && typeof outputTokens === "number"
            ? inputTokens + outputTokens
            : undefined,
      },
      createdAt: new Date().toISOString(),
      raw: { stream: true },
    };
  }

  private async readGeminiStreamingResponse(
    response: Response,
    provider: ProviderConfig,
    modelId: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AtlasCloudChatResponse> {
    let content = "";
    let finishReason: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let totalTokens: number | undefined;

    await this.readJsonSse(response, signal, (event) => {
      if (event?.error) {
        throw new Error(
          event.error.message ||
            "O provedor Gemini encerrou o streaming com erro.",
        );
      }

      const candidate = event?.candidates?.[0];
      const textChunk = (candidate?.content?.parts ?? [])
        .map((part: { text?: unknown }) =>
          typeof part.text === "string" ? part.text : "",
        )
        .join("");

      if (textChunk) {
        content += textChunk;
        onChunk?.(textChunk);
      }

      if (typeof candidate?.finishReason === "string") {
        finishReason = candidate.finishReason;
      }

      if (typeof event?.usageMetadata?.promptTokenCount === "number") {
        inputTokens = event.usageMetadata.promptTokenCount;
      }

      if (typeof event?.usageMetadata?.candidatesTokenCount === "number") {
        outputTokens = event.usageMetadata.candidatesTokenCount;
      }

      if (typeof event?.usageMetadata?.totalTokenCount === "number") {
        totalTokens = event.usageMetadata.totalTokenCount;
      }
    });

    if (!content.trim()) {
      throw new Error("O provedor Gemini retornou uma resposta vazia.");
    }

    return {
      providerId: provider.id,
      providerLabel: provider.label,
      providerKind: "gemini",
      modelId,
      content,
      finishReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens:
          totalTokens ??
          (typeof inputTokens === "number" && typeof outputTokens === "number"
            ? inputTokens + outputTokens
            : undefined),
      },
      createdAt: new Date().toISOString(),
      raw: { stream: true },
    };
  }

  private async readJsonSse(
    response: Response,
    signal: AbortSignal | undefined,
    onEvent: (event: any) => void,
  ): Promise<void> {
    if (!response.body) {
      throw new Error(
        "O provedor não retornou um corpo de resposta para streaming.",
      );
    }

    this.throwIfAborted(signal);

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let streamFinished = false;
    let abortRequested = false;

    const abortStream = () => {
      abortRequested = true;
      void reader.cancel().catch(() => undefined);
    };
    const processLine = (line: string) => {
      const trimmedLine = line.trim();

      if (!trimmedLine.startsWith("data:")) {
        return;
      }

      const dataText = trimmedLine.slice(5).trim();

      if (!dataText) {
        return;
      }

      if (dataText === "[DONE]") {
        streamFinished = true;
        return;
      }

      let event: any;

      try {
        event = JSON.parse(dataText);
      } catch {
        return;
      }

      onEvent(event);
    };

    signal?.addEventListener("abort", abortStream, { once: true });

    try {
      while (!streamFinished) {
        if (abortRequested) {
          throw this.createAbortError();
        }

        const { done, value } = await reader.read();

        if (abortRequested) {
          throw this.createAbortError();
        }

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          processLine(line);

          if (streamFinished) {
            break;
          }
        }
      }

      if (!streamFinished) {
        buffer += decoder.decode();

        for (const line of buffer.split(/\r?\n/)) {
          processLine(line);

          if (streamFinished) {
            break;
          }
        }
      }
    } finally {
      signal?.removeEventListener("abort", abortStream);
      reader.releaseLock();
    }
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

    return this.getModelsForProvider(provider, apiKey);
  }

  private async getModelsForProvider(
    provider: ProviderConfig,
    apiKey: string,
  ): Promise<AtlasModelSummary[]> {
    const providerKind = this.getProviderKind(provider);

    switch (providerKind) {
      case "claude":
        return this.getClaudeModels(provider, apiKey);

      case "gemini":
        return this.getGeminiModels(provider, apiKey);

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

    const json = (await this.safeReadJson(response)) as ModelsApiResponse;

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

  private async getClaudeModels(
    provider: ProviderConfig,
    apiKey: string,
  ): Promise<AtlasModelSummary[]> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    let afterId: string | null = null;
    const models: ClaudeModelRaw[] = [];

    do {
      const query = new URLSearchParams({
        limit: "100",
      });

      if (afterId) {
        query.set("after_id", afterId);
      }

      const response = await this.fetchWithTimeout(
        `${baseUrl}/models?${query.toString()}`,
        {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        },
      );

      const json = (await this.safeReadJson(
        response,
      )) as ClaudeModelsApiResponse;

      if (!response.ok) {
        this.handleApiError(response, json);
      }

      if (!Array.isArray(json.data)) {
        throw new Error("Formato inesperado ao listar modelos Claude.");
      }

      models.push(...json.data);
      afterId = json.has_more ? (json.last_id ?? null) : null;
    } while (afterId);

    if (models.length === 0) {
      return this.getFallbackModelsForProvider(provider);
    }

    return models.map((model) => ({
      id: model.id,
      label: model.display_name || model.id,
      provider: provider.id,
      raw: model,
    }));
  }

  private async getGeminiModels(
    provider: ProviderConfig,
    apiKey: string,
  ): Promise<AtlasModelSummary[]> {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    let pageToken: string | null = null;
    const models: GeminiModelRaw[] = [];

    do {
      const query = new URLSearchParams({
        key: apiKey,
        pageSize: "100",
      });

      if (pageToken) {
        query.set("pageToken", pageToken);
      }

      const response = await this.fetchWithTimeout(
        `${baseUrl}/models?${query.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const json = (await this.safeReadJson(
        response,
      )) as GeminiModelsApiResponse;

      if (!response.ok) {
        this.handleApiError(response, json);
      }

      if (!Array.isArray(json.models)) {
        throw new Error("Formato inesperado ao listar modelos Gemini.");
      }

      models.push(...json.models);
      pageToken = json.nextPageToken ?? null;
    } while (pageToken);

    const generativeModels = models.filter((model) =>
      Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods.includes("generateContent")
        : false,
    );

    if (generativeModels.length === 0) {
      return this.getFallbackModelsForProvider(provider);
    }

    return generativeModels.map((model) => ({
      id: model.baseModelId || this.normalizeGeminiModelName(model.name),
      label: model.displayName || model.baseModelId || model.name || "Gemini",
      provider: provider.id,
      contextWindow:
        typeof model.inputTokenLimit === "number"
          ? model.inputTokenLimit
          : undefined,
      maxTokens:
        typeof model.outputTokenLimit === "number"
          ? model.outputTokenLimit
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

    return [];
  }

  private normalizeGeminiModelName(name?: string): string {
    if (!name) {
      return "";
    }

    return name.startsWith("models/") ? name.slice("models/".length) : name;
  }
}
