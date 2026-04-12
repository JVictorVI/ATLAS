import {
  AtlasConfigSchema,
  ProviderConfig,
} from "../interfaces/AtlasConfigTypes";

export class AtlasConfigDefaults {
  public createDefaultConfig(): AtlasConfigSchema {
    return {
      version: "1.0.0",
      updatedAt: new Date().toISOString(),
      general: {
        theme: "system",
        language: "pt-BR",
        autoSave: true,
        logLevel: "info",
      },
      cloudSecurity: {
        confirmCloud: true,
        blockRag: false,
        limitPayload: true,
        maxTokens: 2048,
        timeout: 30,
      },
      rag: {
        enabled: true,
        autoIndex: false,
        allowCloudContext: false,
        offlineOnly: true,
        chunkSize: 1000,
        chunkOverlap: 200,
        ignoredPaths: ["node_modules", "dist", ".git"],
      },
      ui: {
        defaultView: "chat",
        showTips: true,
      },
      llms: {
        selection: {
          mode: "local",
          local: {
            activeModelId: null,
          },
          cloud: {
            providerId: null,
            activeModelId: null,
          },
        },
        defaults: {
          temperature: 0.2,
          maxTokens: 2048,
          topP: 0.95,
          stream: true,
        },
        localModels: {},
      },
      custom: {},
      providers: this.createDefaultProviders(),
    };
  }

  public mergeWithDefaults(
    partial: Partial<AtlasConfigSchema>,
  ): AtlasConfigSchema {
    const defaults = this.createDefaultConfig();

    return {
      ...defaults,
      ...partial,
      general: {
        ...defaults.general,
        ...(partial.general ?? {}),
      },
      cloudSecurity: {
        ...defaults.cloudSecurity,
        ...(partial.cloudSecurity ?? {}),
      },
      rag: {
        ...defaults.rag,
        ...(partial.rag ?? {}),
      },
      ui: {
        ...defaults.ui,
        ...(partial.ui ?? {}),
      },
      llms: {
        ...defaults.llms,
        ...(partial.llms ?? {}),
        selection: {
          ...defaults.llms.selection,
          ...(partial.llms?.selection ?? {}),
          local: {
            ...defaults.llms.selection.local,
            ...(partial.llms?.selection?.local ?? {}),
          },
          cloud: {
            ...defaults.llms.selection.cloud,
            ...(partial.llms?.selection?.cloud ?? {}),
          },
        },
        defaults: {
          ...defaults.llms.defaults,
          ...(partial.llms?.defaults ?? {}),
        },
        localModels: {
          ...defaults.llms.localModels,
          ...(partial.llms?.localModels ?? {}),
        },
      },
      custom: {
        ...(defaults.custom ?? {}),
        ...(partial.custom ?? {}),
      },
      providers: partial.providers ?? defaults.providers,
      updatedAt: partial.updatedAt ?? defaults.updatedAt,
      version: partial.version ?? defaults.version,
    };
  }

  private createDefaultProviders(): ProviderConfig[] {
    return [
      {
        id: "OpenAI",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKeyPlaceholder: "sk-...",
      },
      {
        id: "OpenRouter",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKeyPlaceholder: "sk-or-v1-...",
      },
      {
        id: "Groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKeyPlaceholder: "gsk_...",
      },
    ];
  }
}
