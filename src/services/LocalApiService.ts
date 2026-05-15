import {
  AtlasCloudChatResponse,
  ChatMessage,
  OpenAiCompatibleResponse,
} from "../interfaces/ApiTypes";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasLocalRuntimeService } from "./AtlasLocalRuntimeService";

export class LocalApiService {
  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly localRuntimeService: AtlasLocalRuntimeService,
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
    await this.localRuntimeService.ensureRuntime(model);

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
        messages: this.applyModelBehavior(messages, model),
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
      return this.readStreamingResponse(response, model, onChunk);
    }

    const data = (await this.safeReadJson(response)) as OpenAiCompatibleResponse;
    return this.normalizeLocalResponse(model, data);
  }

  private resolveBaseUrl(model: AtlasModelConfig): string {
    const candidate =
      typeof model.baseUrl === "string" && model.baseUrl.trim()
        ? model.baseUrl.trim()
        : typeof model.custom?.baseUrl === "string" && model.custom.baseUrl.trim()
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
          `Timeout da execucao local: o runtime nao respondeu em ${timeout / 1000} segundos.`,
        );
      }

      throw new Error(
        `Falha ao conectar ao runtime local. Verifique se ele esta ativo e expondo uma API OpenAI-compatible. Detalhes: ${
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
          message: "Resposta JSON invalida retornada pelo runtime local.",
        },
      };
    }
  }

  private handleLocalApiError(response: Response, data?: any): never {
    const providerMessage =
      data?.error?.message ||
      data?.error?.details ||
      "Erro desconhecido retornado pelo runtime local.";

    throw new Error(
      `Falha na execucao local (HTTP ${response.status}): ${providerMessage}`,
    );
  }

  private async readStreamingResponse(
    response: Response,
    model: AtlasModelConfig,
    onChunk?: (chunk: string) => void,
  ): Promise<AtlasCloudChatResponse> {
    if (!response.body) {
      throw new Error(
        "O runtime local nao retornou um corpo de resposta para streaming.",
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let buffer = "";
    let finishReason: string | undefined;

    try {
      let isStreamFinished = false;

      while (!isStreamFinished) {
        const { done, value } = await reader.read();
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
      reader.releaseLock();
    }

    if (!fullContent.trim()) {
      throw new Error("O runtime local retornou uma resposta vazia.");
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

  private normalizeLocalResponse(
    model: AtlasModelConfig,
    data: OpenAiCompatibleResponse,
  ): AtlasCloudChatResponse {
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();

    if (!content) {
      throw new Error("O runtime local retornou uma resposta vazia.");
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
