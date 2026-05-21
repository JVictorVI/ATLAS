import {
  AtlasCloudChatResponse,
  ChatMessage,
  OpenAiCompatibleResponse,
} from "../interfaces/ApiTypes";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasLocalEngineService } from "./AtlasLocalEngineService";

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
    const resolved = this.configManager.getResolvedLocalSelection();

    if (!resolved) {
      throw new Error(
        "A selecao local esta incompleta. Defina um modelo local ativo antes de enviar a mensagem.",
      );
    }

    const model = resolved.model;
    await this.localEngineService.ensureEngine(model);

    const baseUrl = this.resolveBaseUrl(model);
    const endpoint = `${baseUrl}/chat/completions`;
    const defaults = this.configManager.getConfig().llms.defaults;
    const isStreaming = typeof onChunk === "function";

    const response = await this.fetchWithTimeout(endpoint, {
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
        max_tokens: model.parameters.maxTokens ?? defaults.maxTokens,
        top_p: model.parameters.topP ?? defaults.topP,
        stream: isStreaming,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorData = await this.safeReadJson(response);
      this.handleLocalApiError(response, errorData);
    }

    if (isStreaming) {
      return this.readStreamingResponse(response, model, onChunk, options?.signal);
    }

    const data = (await this.safeReadJson(
      response,
    )) as OpenAiCompatibleResponse;
    return this.normalizeLocalResponse(model, data);
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
    const timeoutSetting =
      this.configManager.getConfig().cloudSecurity?.timeout;
    const timeout = (timeoutSetting ? timeoutSetting : 30) * 1000;
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
      clearTimeout(id);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async safeReadJson(response: Response): Promise<any> {
    try {
      return await response.json();
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
