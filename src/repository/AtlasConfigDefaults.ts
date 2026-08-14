import {
  AtlasCloudConfigs,
  AtlasConfigSchema,
  AtlasLocalEngineCustomConfig,
  AtlasRagSettings,
  ProviderConfig,
} from "../interfaces/AtlasConfigTypes";
import { AtlasContextProfileService } from "../services/AtlasContextProfileService";

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
      cloudConfigs: {
        limitPayload: true,
        dynamicMaxTokens: false,
        sendOnlyRequiredParameters: false,
        maxTokens: 8192,
        timeout: 30,
        temperature: 0.4,
        topP: 0.95,
        stream: true,
      },
      rag: {
        enabled: true,
        autoIndex: false,
        allowLocalContext: true,
        allowCloudContext: false,
        offlineOnly: true,
        chunkSize: 1000,
        chunkOverlap: 200,
        ignoredPaths: ["node_modules", "dist", ".git"],
        embeddingModel: "atlas-embedding",
        embeddingModelsDir: "",
        topK: 6,
        maxContextCharacters: 12000,
        maxFileSizeBytes: 2 * 1024 * 1024,
        externalDocumentMaxFileSizeBytes: 25 * 1024 * 1024,
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
        indexingMode: "incremental",
        promptIndexOnChange: false,
        indexOnStartup: false,
        promptBeforeStartupIndex: false,
        autoIndexDebounceMs: 2000,
        relevanceMode: "maxDistance",
        relevanceThreshold: 0.9,
        maxChunksPerFile: 2,
        diversifyFiles: true,
        excludeActiveFile: true,
        includeExternalDocuments: true,
        useInCodeEditing: false,
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
          temperature: 0.4,
          maxTokens: 8192,
          topP: 0.95,
          stream: true,
        },
        localModels: {},
      },
      custom: {
        contextProfile: AtlasContextProfileService.getDefaultProfile(),
        saveInterruptedResponses: true,
        refactoring: {
          enabled: true,
          useModelIntentDetection: false,
        },
        localEngine: {
          dynamicContextWindow: true,
          prepareOnAtlasOpen: true,
          stream: true,
          timeout: 30,
        },
        staticAnalysis: {
          enabled: true,
          useInQuickAnalysis: true,
          useInArchitecturalAnalysis: true,
          useInRefactoring: true,
          includeDiagnostics: false,
          includeSymbolRelations: false,
        },
      },
      providers: this.createDefaultProviders(),
    };
  }

  public mergeWithDefaults(
    partial: Partial<AtlasConfigSchema> & {
      cloudSecurity?: Partial<AtlasCloudConfigs>;
    },
  ): AtlasConfigSchema {
    const defaults = this.createDefaultConfig();
    const {
      cloudSecurity: legacyCloudSecurity,
      cloudConfigs: partialCloudConfigs,
      ...partialWithoutLegacyCloudSecurity
    } = partial;
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
    const defaultLocalEngine = (defaults.custom?.localEngine ??
      {}) as AtlasLocalEngineCustomConfig;
    const partialLocalEngine = (partial.custom?.localEngine ??
      {}) as AtlasLocalEngineCustomConfig;
    const contextProfile = AtlasContextProfileService.normalize(
      partial.custom?.contextProfile,
      defaults.custom?.contextProfile ??
        AtlasContextProfileService.getDefaultProfile(),
    );
    const legacyLlmCloudDefaults = this.pickDefinedCloudRequestDefaults(
      partial.llms?.defaults,
    );

    return {
      ...defaults,
      ...partialWithoutLegacyCloudSecurity,
      general: {
        ...defaults.general,
        ...(partial.general ?? {}),
      },
      cloudConfigs: {
        ...defaults.cloudConfigs,
        ...(legacyCloudSecurity ?? {}),
        ...legacyLlmCloudDefaults,
        ...(partialCloudConfigs ?? {}),
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
        contextProfile,
        localEngine: {
          ...defaultLocalEngine,
          ...partialLocalEngine,
          dynamicContextWindow:
            partialLocalEngine.dynamicContextWindow ??
            defaultLocalEngine.dynamicContextWindow ??
            true,
        },
        refactoring: {
          enabled:
            partial.custom?.refactoring?.enabled ??
            defaults.custom?.refactoring?.enabled ??
            true,
          useModelIntentDetection:
            partial.custom?.refactoring?.useModelIntentDetection ??
            defaults.custom?.refactoring?.useModelIntentDetection ??
            false,
        },
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
          useInRefactoring:
            partial.custom?.staticAnalysis?.useInRefactoring ??
            defaults.custom?.staticAnalysis?.useInRefactoring ??
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
      providers: this.mergeProviders(defaults.providers ?? [], partial.providers),
      updatedAt: partial.updatedAt ?? defaults.updatedAt,
      version: partial.version ?? defaults.version,
    };
  }

  private mergeProviders(
    defaults: ProviderConfig[],
    configured?: ProviderConfig[],
  ): ProviderConfig[] {
    const providersById = new Map<string, ProviderConfig>();

    for (const provider of defaults) {
      providersById.set(provider.id, provider);
    }

    for (const provider of configured ?? []) {
      providersById.set(provider.id, {
        ...providersById.get(provider.id),
        ...provider,
      });
    }

    return Array.from(providersById.values());
  }

  private pickDefinedCloudRequestDefaults(
    defaults?: Partial<AtlasCloudConfigs>,
  ): Partial<AtlasCloudConfigs> {
    const picked: Partial<AtlasCloudConfigs> = {};

    if (typeof defaults?.temperature === "number") {
      picked.temperature = defaults.temperature;
    }

    if (typeof defaults?.maxTokens === "number") {
      picked.maxTokens = defaults.maxTokens;
    }

    if (typeof defaults?.topP === "number") {
      picked.topP = defaults.topP;
    }

    if (typeof defaults?.stream === "boolean") {
      picked.stream = defaults.stream;
    }

    return picked;
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
      {
        id: "HuggingFace",
        label: "Hugging Face",
        baseUrl: "https://huggingface.co",
        apiKeyPlaceholder: "hf_...",
      },
    ];
  }
}
