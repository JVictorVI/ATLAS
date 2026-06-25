import {
  AtlasConfigSchema,
  AtlasRagSettings,
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
        embeddingModel: "atlas-embedding",
        topK: 6,
        maxContextCharacters: 12000,
        maxFileSizeBytes: 2 * 1024 * 1024,
        allowedExtensions: [
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          ".mjs",
          ".cjs",
          ".py",
          ".java",
          ".kt",
          ".kts",
          ".cs",
          ".cpp",
          ".cc",
          ".c",
          ".h",
          ".hpp",
          ".go",
          ".rs",
          ".php",
          ".rb",
          ".swift",
          ".dart",
          ".vue",
          ".svelte",
          ".html",
          ".css",
          ".scss",
          ".sql",
        ],
        respectGitIgnore: true,
        includeMarkdownFiles: true,
        includeConfigFiles: true,
        indexOnAdd: true,
        autoIndexDebounceMs: 2000,
        relevanceMode: "maxDistance",
        relevanceThreshold: 0.9,
        maxChunksPerFile: 2,
        diversifyFiles: true,
        excludeActiveFile: true,
        includeExternalDocuments: true,
        sourcePriority: "balanced",
        languageFilters: [],
        directoryFilters: [],
        showSources: true,
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
      custom: {
        staticAnalysis: {
          enabled: true,
          useInQuickAnalysis: true,
          useInArchitecturalAnalysis: true,
          includeDiagnostics: false,
          includeSymbolRelations: false,
        },
      },
      providers: this.createDefaultProviders(),
    };
  }

  public mergeWithDefaults(
    partial: Partial<AtlasConfigSchema>,
  ): AtlasConfigSchema {
    const defaults = this.createDefaultConfig();
    const ragPartial = (partial.rag ?? {}) as Partial<AtlasRagSettings> & {
      includeSupportFiles?: boolean;
    };
    const {
      includeSupportFiles: legacyIncludeSupportFiles,
      ...currentRagPartial
    } = ragPartial;
    const includeMarkdownFiles =
      ragPartial.includeMarkdownFiles ?? legacyIncludeSupportFiles;
    const includeConfigFiles =
      ragPartial.includeConfigFiles ?? legacyIncludeSupportFiles;

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
        ...currentRagPartial,
        includeMarkdownFiles:
          includeMarkdownFiles ?? defaults.rag.includeMarkdownFiles,
        includeConfigFiles:
          includeConfigFiles ?? defaults.rag.includeConfigFiles,
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
        staticAnalysis: {
          enabled:
            partial.custom?.staticAnalysis?.enabled ??
            defaults.custom?.staticAnalysis?.enabled ??
            true,
          useInQuickAnalysis:
            partial.custom?.staticAnalysis?.useInQuickAnalysis ??
            defaults.custom?.staticAnalysis?.useInQuickAnalysis ??
            true,
          useInArchitecturalAnalysis:
            partial.custom?.staticAnalysis?.useInArchitecturalAnalysis ??
            defaults.custom?.staticAnalysis?.useInArchitecturalAnalysis ??
            true,
          includeDiagnostics:
            partial.custom?.staticAnalysis?.includeDiagnostics ??
            defaults.custom?.staticAnalysis?.includeDiagnostics ??
            false,
          includeSymbolRelations:
            partial.custom?.staticAnalysis?.includeSymbolRelations ??
            defaults.custom?.staticAnalysis?.includeSymbolRelations ??
            false,
        },
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
        kind: "openai-compatible",
      },
      {
        id: "OpenRouter",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKeyPlaceholder: "sk-or-v1-...",
        kind: "openai-compatible",
      },
      {
        id: "Groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKeyPlaceholder: "gsk_...",
        kind: "openai-compatible",
      },
      {
        id: "Claude",
        label: "Claude",
        baseUrl: "https://api.anthropic.com/v1",
        apiKeyPlaceholder: "sk-ant-...",
        kind: "claude",
      },
      {
        id: "Gemini",
        label: "Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKeyPlaceholder: "AIza...",
        kind: "gemini",
      },
      {
        id: "xAI",
        label: "Grok (xAI)",
        baseUrl: "https://api.x.ai/v1",
        apiKeyPlaceholder: "xai-...",
        kind: "openai-compatible",
      },
    ];
  }
}
