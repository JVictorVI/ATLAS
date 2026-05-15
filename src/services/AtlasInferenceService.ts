import { AtlasCloudChatResponse, ChatMessage } from "../interfaces/ApiTypes";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { CloudApiService } from "./CloudApiService";
import { LocalApiService } from "./LocalApiService";

export class AtlasInferenceService {
  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly cloudApiService: CloudApiService,
    private readonly localApiService: LocalApiService,
  ) {}

  public async sendChat(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    options?: { signal?: AbortSignal },
  ): Promise<AtlasCloudChatResponse> {
    if (this.configManager.isLocalMode()) {
      return this.localApiService.sendChat(
        this.removeGlobalCustomization(messages),
        onChunk,
        options,
      );
    }

    return this.cloudApiService.sendChat(messages, onChunk, options);
  }

  public static isAbortError(error: unknown): boolean {
    return CloudApiService.isAbortError(error);
  }

  private removeGlobalCustomization(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter(
      (message) =>
        !(
          message.role === "system" &&
          message.content.startsWith("Diretivas complementares do usuário:")
        ),
    );
  }
}
