import {
  AtlasCloudChatResponse,
  ChatMessage,
  OpenAiCompatibleResponse,
} from "../interfaces/ApiTypes";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasLocalEngineService } from "./AtlasLocalEngineService";
import { ATLAS_LOCAL_MODEL_DEFAULTS } from "./AtlasLocalModelDefaults";

const LOCAL_CONTEXT_GROWTH_CAP = 65536;
const LOCAL_CONTEXT_GROWTH_PADDING = 512;

type LocalContextOverflow = {
  requestedTokens: number;
  availableTokens: number;
  promptTokens?: number;
  completionTokens?: number;
};

export class LocalApiService {
  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly localEngineService: AtlasLocalEngineService,
  ) {}

  public async sendChat(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    options?: { signal?: AbortSignal },
  ): Promise<AtlasCloudChatResponse> {
    const signal = options?.signal;

    this.throwIfAborted(signal);

    const resolved = this.configManager.getResolvedLocalSelection();

    if (!resolved) {
      throw new Error(
        "A selecao local esta incompleta. Defina um modelo local ativo antes de enviar a mensagem.",
      );
    }

    const model = resolved.model;
    await this.localEngineService.ensureEngine(model);

    this.throwIfAborted(signal);

    const baseUrl = this.resolveBaseUrl(model);
    const endpoint = `${baseUrl}/chat/completions`;
    const defaults = this.configManager.getConfig().llms.defaults;
    const isStreaming = typeof onChunk === "function";
    let activeModel = model;
    let response = await this.sendLocalRequest(
      baseUrl,
      endpoint,
      activeModel,
      messages,
      defaults,
      isStreaming,
      signal,
    );

    this.throwIfAborted(signal);

    if (!response.ok) {
      const errorData = await this.safeReadJson(response);

      this.throwIfAborted(signal);

      const contextOverflow = this.getContextOverflow(errorData);

      if (contextOverflow) {
        if (!this.isDynamicContextWindowEnabled()) {
          this.handleFixedContextOverflow(contextOverflow, errorData);
        }

        activeModel = await this.adjustDynamicContextWindow(
          activeModel,
          contextOverflow,
        );
        console.info(
          "[ATLAS local] Reiniciando engine local para aplicar contexto dinâmico.",
          {
            modelId: activeModel.id,
            modelName: activeModel.name,
            contextWindow: activeModel.parameters.contextWindow,
          },
        );
        await this.localEngineService.restartEngine(activeModel, {
          reason: "parameter-update",
        });

        this.throwIfAborted(signal);

        response = await this.sendLocalRequest(
          baseUrl,
          endpoint,
          activeModel,
          messages,
          defaults,
          isStreaming,
          signal,
        );

        this.throwIfAborted(signal);

        if (!response.ok) {
          this.handleLocalApiError(response, await this.safeReadJson(response));
        }
      } else {
        this.handleLocalApiError(response, errorData);
      }
    }

    if (isStreaming) {
      return this.readStreamingResponse(
        response,
        activeModel,
        onChunk,
        options?.signal,
      );
    }

    const data = (await this.safeReadJson(
      response,
    )) as OpenAiCompatibleResponse;

    this.throwIfAborted(signal);

    return this.normalizeLocalResponse(activeModel, data);
  }

  private resolveBaseUrl(model: AtlasModelConfig): string {
    const candidate =
      typeof model.baseUrl === "string" && model.baseUrl.trim()
        ? model.baseUrl.trim()
        : typeof model.custom?.baseUrl === "string" &&
            model.custom.baseUrl.trim()
          ? model.custom.baseUrl.trim()
          : "http://127.0.0.1:8080/v1";

    return candidate.replace(/\/+$/, "");
  }

  private applyModelBehavior(
    messages: ChatMessage[],
    model: AtlasModelConfig,
  ): ChatMessage[] {
    const systemPrompt =
      typeof model.custom?.systemPrompt === "string"
        ? model.custom.systemPrompt.trim()
        : "";

    if (!systemPrompt || this.isQuickAnalysisRequest(messages)) {
      return messages;
    }

    const [firstMessage, ...remainingMessages] = messages;
    const behaviorMessage: ChatMessage = {
      role: "system",
      content: [
        `Comportamento personalizado do modelo local "${model.name}":`,
        systemPrompt,
        "",
        "Essas diretivas sao complementares e nao substituem as regras obrigatorias do ATLAS.",
      ].join("\n"),
    };

    if (firstMessage?.role === "system") {
      return [firstMessage, behaviorMessage, ...remainingMessages];
    }

    return [behaviorMessage, ...messages];
  }

  private async sendLocalRequest(
    baseUrl: string,
    endpoint: string,
    model: AtlasModelConfig,
    messages: ChatMessage[],
    defaults: { temperature: number; maxTokens: number; topP: number },
    isStreaming: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const requestOptions: RequestInit & { signal?: AbortSignal } = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.apiModelName || model.id,
        messages: this.prepareMessagesForLlamaCpp(
          this.applyModelBehavior(messages, model),
        ),
        temperature: model.parameters.temperature ?? defaults.temperature,
        max_tokens: this.resolveMaxTokens(model, defaults.maxTokens),
        top_p: model.parameters.topP ?? defaults.topP,
        stream: isStreaming,
      }),
      signal,
    };

    if (isStreaming) {
      return this.fetchWithTimeout(endpoint, requestOptions);
    }

    await this.ensureBackendResponding(baseUrl, signal);
    return this.fetchWithoutTimeout(endpoint, requestOptions);
  }

  private async adjustDynamicContextWindow(
    model: AtlasModelConfig,
    overflow: LocalContextOverflow,
  ): Promise<AtlasModelConfig> {
    const currentContext = this.normalizePositiveInteger(
      model.parameters.contextWindow,
      overflow.availableTokens || ATLAS_LOCAL_MODEL_DEFAULTS.contextWindow,
    );
    const minimumContext = Math.max(
      overflow.requestedTokens > 0
        ? overflow.requestedTokens + LOCAL_CONTEXT_GROWTH_PADDING
        : 0,
      currentContext + 1,
    );
    const nextContext = Math.min(
      LOCAL_CONTEXT_GROWTH_CAP,
      this.nextPowerOfTwo(minimumContext),
    );

    if (nextContext <= currentContext) {
      throw new Error(
        `A mensagem exige ${overflow.requestedTokens} tokens, mas o limite dinamico de contexto (${LOCAL_CONTEXT_GROWTH_CAP}) ja foi atingido.`,
      );
    }

    const updatedConfig = this.configManager.updateModel(model.id, {
      parameters: {
        contextWindow: nextContext,
      },
    });
    const updatedModel = updatedConfig.llms.localModels[model.id];

    if (!updatedModel) {
      throw new Error(
        `O contexto foi ajustado, mas o modelo "${model.id}" não foi encontrado no arquivo de configuracao.`,
      );
    }

    console.warn(
      `[ATLAS local] Contexto insuficiente (${overflow.requestedTokens}/${overflow.availableTokens}). Ajustando ctx-size de ${currentContext} para ${nextContext}.`,
    );
    console.info("[ATLAS local] Contexto dinâmico salvo no modelo.", {
      modelId: model.id,
      modelName: model.name,
      requestedTokens: overflow.requestedTokens,
      availableTokens: overflow.availableTokens,
      previousContextWindow: currentContext,
      nextContextWindow: nextContext,
    });

    return updatedModel;
  }

  private nextPowerOfTwo(value: number): number {
    let result = 1;
    while (result < value) {
      result *= 2;
    }

    return result;
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized <= 0) {
      return fallback;
    }

    return Math.floor(normalized);
  }

  private resolveMaxTokens(model: AtlasModelConfig, fallback: number): number {
    return this.normalizePositiveInteger(model.parameters.maxTokens, fallback);
  }

  private isDynamicContextWindowEnabled(): boolean {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine !== "object" || localEngine === null) {
      return true;
    }

    return localEngine.dynamicContextWindow !== false;
  }

  private handleFixedContextOverflow(
    overflow: { requestedTokens: number; availableTokens: number },
    data?: any,
  ): never {
    const providerMessage =
      data?.error?.message || data?.error?.details || data?.message || "";
    const tokenDetails =
      overflow.requestedTokens > 0 && overflow.availableTokens > 0
        ? `A requisição pediu ${overflow.requestedTokens} tokens, mas o contexto fixo atual comporta ${overflow.availableTokens}.`
        : "";

    throw new Error(
      [
        "O tamanho de contexto fixo do modelo local nao comporta esta requisicao.",
        tokenDetails,
        "Aumente o tamanho do contexto na Biblioteca ou ative o ajuste automatico nas Configuracoes Gerais.",
        providerMessage ? `Detalhes da engine: ${providerMessage}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  private prepareMessagesForLlamaCpp(messages: ChatMessage[]): ChatMessage[] {
    const systemContent = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n\n");

    const alternatingMessages = this.normalizeAlternatingMessages(
      messages.filter((message) => message.role !== "system"),
    );

    if (!systemContent) {
      return alternatingMessages;
    }

    return [
      {
        role: "system",
        content: systemContent,
      },
      ...alternatingMessages,
    ];
  }

  private normalizeAlternatingMessages(messages: ChatMessage[]): ChatMessage[] {
    const normalized: ChatMessage[] = [];

    for (const message of messages) {
      const content = message.content.trim();

      if (!content) {
        continue;
      }

      if (message.role === "system") {
        continue;
      }

      if (normalized.length === 0 && message.role === "assistant") {
        normalized.push({
          role: "user",
          content: [
            "Contexto anterior da conversa:",
            content,
            "",
            "Continue a partir deste contexto.",
          ].join("\n"),
        });
        continue;
      }

      const previous = normalized.at(-1);

      if (previous?.role === message.role) {
        previous.content = `${previous.content}\n\n${content}`;
        continue;
      }

      normalized.push({
        role: message.role,
        content,
      });
    }

    return normalized;
  }

  private isQuickAnalysisRequest(messages: ChatMessage[]): boolean {
    return messages.some(
      (message) =>
        message.role === "user" &&
        message.content.includes("Retorne exclusivamente JSON valido"),
    );
  }

  private async fetchWithTimeout(
    resource: string,
    options: RequestInit & { signal?: AbortSignal },
  ): Promise<Response> {
    const timeout = this.getLocalResponseTimeoutMs();
    const controller = new AbortController();
    const id =
      timeout === 0 ? undefined : setTimeout(() => controller.abort(), timeout);
    const abortFromCaller = () => controller.abort();

    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener("abort", abortFromCaller, {
        once: true,
      });
    }

    try {
      const { signal: _signal, ...fetchOptions } = options;
      return await fetch(resource, {
        ...fetchOptions,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (options.signal?.aborted) {
          throw error;
        }

        throw new Error(
          `Timeout da execução local: a engine não respondeu em ${timeout / 1000} segundos.`,
        );
      }

      throw new Error(
        `Falha ao conectar à engine local. Verifique se ela está ativa e expondo uma API OpenAI-compatible. Detalhes: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`,
      );
    } finally {
      if (id !== undefined) {
        clearTimeout(id);
      }
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async fetchWithoutTimeout(
    resource: string,
    options: RequestInit & { signal?: AbortSignal },
  ): Promise<Response> {
    try {
      return await fetch(resource, options);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }

      throw new Error(
        `Falha ao conectar à engine local. Verifique se ela está ativa e expondo uma API OpenAI-compatible. Detalhes: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`,
      );
    }
  }

  private async ensureBackendResponding(
    baseUrl: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const serverBaseUrl = baseUrl.replace(/\/v1\/?$/i, "");
    const probes = [`${serverBaseUrl}/health`, `${baseUrl}/models`];

    if (await this.anyProbeResponds(probes, signal)) {
      return;
    }

    throw new Error(
      `Timeout da execução local: a engine não respondeu em ${this.getLocalResponseTimeoutMs() / 1000} segundos.`,
    );
  }

  private async anyProbeResponds(
    probes: string[],
    signal?: AbortSignal,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let pending = probes.length;
      let settled = false;

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      for (const probe of probes) {
        void this.canFetchWithTimeout(probe, signal)
          .then((ok) => {
            if (ok) {
              finish(true);
            }
          })
          .catch((error) => {
            if (signal?.aborted && !settled) {
              settled = true;
              reject(error);
            }
          })
          .finally(() => {
            pending -= 1;

            if (pending === 0) {
              finish(false);
            }
          });
      }
    });
  }

  private async canFetchWithTimeout(
    resource: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const timeout = this.getLocalResponseTimeoutMs();
    const controller = new AbortController();
    const id =
      timeout === 0 ? undefined : setTimeout(() => controller.abort(), timeout);
    const abortFromCaller = () => controller.abort();

    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    try {
      const response = await fetch(resource, {
        method: "GET",
        signal: controller.signal,
      });
      return response.ok;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      return false;
    } finally {
      if (id !== undefined) {
        clearTimeout(id);
      }
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private getLocalResponseTimeoutMs(): number {
    const config = this.configManager.getConfig();
    const localEngine = config.custom?.localEngine;
    const timeoutSetting =
      typeof localEngine === "object" && localEngine !== null
        ? localEngine.timeout
        : undefined;

    if (timeoutSetting === 0) {
      return 0;
    }

    const timeout =
      typeof timeoutSetting === "number" && timeoutSetting > 0
        ? timeoutSetting
        : 30;

    return timeout * 1000;
  }

  private async safeReadJson(response: Response): Promise<any> {
    try {
      const text = await response.text();

      if (!text.trim()) {
        return {
          error: {
            message: "Resposta vazia retornada pela engine local.",
          },
        };
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          error: {
            message: text,
          },
        };
      }
    } catch {
      return {
        error: {
          message: "Resposta JSON inválida retornada pela engine local.",
        },
      };
    }
  }

  private handleLocalApiError(response: Response, data?: any): never {
    const providerMessage =
      data?.error?.message ||
      data?.error?.details ||
      "Erro desconhecido retornado pela engine local.";

    throw new Error(
      `Falha na execução local (HTTP ${response.status}): ${providerMessage}`,
    );
  }

  private getContextOverflow(data?: any): LocalContextOverflow | null {
    const message = String(
      data?.error?.message || data?.error?.details || data?.message || "",
    );
    const normalizedMessage = message.toLowerCase();
    const isOverflow =
      normalizedMessage.includes("exceeds the available context size") ||
      normalizedMessage.includes("context size") ||
      normalizedMessage.includes("context length") ||
      normalizedMessage.includes("context window");

    if (!isOverflow) {
      return null;
    }

    const match = message.match(
      /request\s*\((\d+)\s+tokens?\).*?context size\s*\((\d+)\s+tokens?\)/i,
    );
    const openAiStyleMatch = message.match(
      /requested\s+(\d+)\s+tokens?.*?\((\d+)\s+in\s+the\s+messages?,\s*(\d+)\s+in\s+the\s+completion\)/i,
    );
    const maxContextMatch = message.match(
      /maximum\s+context\s+length\s+is\s+(\d+)\s+tokens?/i,
    );

    if (openAiStyleMatch) {
      return {
        requestedTokens: Number(openAiStyleMatch[1]),
        availableTokens: match
          ? Number(match[2])
          : maxContextMatch
            ? Number(maxContextMatch[1])
            : 0,
        promptTokens: Number(openAiStyleMatch[2]),
        completionTokens: Number(openAiStyleMatch[3]),
      };
    }

    return {
      requestedTokens: match ? Number(match[1]) : 0,
      availableTokens: match ? Number(match[2]) : 0,
    };
  }

  private async readStreamingResponse(
    response: Response,
    model: AtlasModelConfig,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AtlasCloudChatResponse> {
    if (!response.body) {
      throw new Error(
        "A engine local não retornou um corpo de resposta para streaming.",
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
            // Ignora fragmentos SSE incompletos.
          }
        }
      }
    } finally {
      signal?.removeEventListener("abort", abortStream);
      reader.releaseLock();
    }

    if (!fullContent.trim()) {
      throw new Error("A engine local retornou uma resposta vazia.");
    }

    return {
      providerId: "local",
      providerLabel: "Local",
      providerKind: "local",
      modelId: model.id,
      content: fullContent,
      finishReason: finishReason ?? "stop",
      usage: undefined,
      createdAt: new Date().toISOString(),
      raw: { stream: true },
    };
  }

  private createAbortError(): Error {
    const error = new Error("Geração local cancelada pelo usuário.");
    error.name = "AbortError";
    return error;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw this.createAbortError();
  }

  private normalizeLocalResponse(
    model: AtlasModelConfig,
    data: OpenAiCompatibleResponse,
  ): AtlasCloudChatResponse {
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();

    if (!content) {
      throw new Error("A engine local retornou uma resposta vazia.");
    }

    const usageRaw = (data as any).usage;

    return {
      providerId: "local",
      providerLabel: "Local",
      providerKind: "local",
      modelId: model.id,
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
}
