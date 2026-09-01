import {
  AtlasContextProfileMode,
  AtlasContextProfileSettings,
  AtlasConfigSchema,
  AtlasExecutionMode,
  AtlasStaticAnalysisConfig,
} from "../interfaces/AtlasConfigTypes";

type AtlasPresetMode = Exclude<AtlasContextProfileMode, "custom">;

export type AtlasContextProfileEffects = {
  contextProfile: AtlasContextProfileSettings;
  rag: {
    topK: number;
    maxContextCharacters: number;
  };
  staticAnalysis: AtlasStaticAnalysisConfig;
  localEngine: {
    dynamicContextWindow: boolean;
  };
};

const PRESETS: Record<AtlasPresetMode, AtlasContextProfileSettings> = {
  light: {
    mode: "light",
    historyWindowSize: 5,
    includeArchitecturalMemory: false,
    includeRagContext: false,
    includeEditorContext: true,
    maxEditorContextCharacters: 10000,
    includeStaticAnalysis: false,
    ragTopK: 2,
    ragMaxContextCharacters: 4000,
  },
  balanced: {
    mode: "balanced",
    historyWindowSize: 8,
    includeArchitecturalMemory: true,
    includeRagContext: true,
    includeEditorContext: true,
    maxEditorContextCharacters: 20000,
    includeStaticAnalysis: false,
    ragTopK: 4,
    ragMaxContextCharacters: 10000,
  },
  advanced: {
    mode: "advanced",
    historyWindowSize: 12,
    includeArchitecturalMemory: true,
    includeRagContext: true,
    includeEditorContext: true,
    maxEditorContextCharacters: 40000,
    includeStaticAnalysis: true,
    ragTopK: 6,
    ragMaxContextCharacters: 20000,
  },
};

export class AtlasContextProfileService {
  public static getDefaultProfile(): AtlasContextProfileSettings {
    return this.getPreset("balanced");
  }

  public static getPreset(
    mode: AtlasContextProfileMode,
  ): AtlasContextProfileSettings {
    if (mode === "light" || mode === "advanced" || mode === "balanced") {
      return { ...PRESETS[mode] };
    }

    return {
      ...PRESETS.balanced,
      mode: "custom",
    };
  }

  public static getPresetEffects(
    mode: AtlasContextProfileMode,
  ): AtlasContextProfileEffects | null {
    if (!this.isPresetMode(mode)) {
      return null;
    }

    const contextProfile = this.getPreset(mode);

    return {
      contextProfile,
      rag: {
        topK: contextProfile.ragTopK,
        maxContextCharacters: contextProfile.ragMaxContextCharacters,
      },
      staticAnalysis: this.getPresetStaticAnalysis(mode),
      localEngine: {
        dynamicContextWindow: mode !== "light",
      },
    };
  }

  public static resolve(
    config: AtlasConfigSchema,
    executionMode: AtlasExecutionMode = config.llms.selection.mode,
  ): AtlasContextProfileSettings {
    return this.normalize(
      config.custom?.contextProfiles?.[executionMode] ??
        config.custom?.contextProfile,
    );
  }

  public static resolveRag(
    config: AtlasConfigSchema,
    executionMode: AtlasExecutionMode = config.llms.selection.mode,
  ): AtlasContextProfileEffects["rag"] {
    const profile = this.resolve(config, executionMode);

    return profile.mode === "custom"
      ? {
          topK: config.rag.topK,
          maxContextCharacters: config.rag.maxContextCharacters,
        }
      : {
          topK: profile.ragTopK,
          maxContextCharacters: profile.ragMaxContextCharacters,
        };
  }

  public static normalize(
    value: unknown,
    fallback: AtlasContextProfileSettings = this.getDefaultProfile(),
  ): AtlasContextProfileSettings {
    if (!this.isProfileCandidate(value)) {
      return { ...fallback };
    }

    const mode = this.normalizeMode(value.mode, fallback.mode);

    if (this.isPresetMode(mode)) {
      return this.getPreset(mode);
    }

    return {
      mode: "custom",
      historyWindowSize: this.clampInteger(
        value.historyWindowSize,
        0,
        30,
        fallback.historyWindowSize,
      ),
      includeArchitecturalMemory: value.includeArchitecturalMemory === true,
      includeRagContext: value.includeRagContext === true,
      includeEditorContext: value.includeEditorContext !== false,
      maxEditorContextCharacters: this.clampInteger(
        value.maxEditorContextCharacters,
        1000,
        100000,
        fallback.maxEditorContextCharacters,
      ),
      includeStaticAnalysis: value.includeStaticAnalysis === true,
      ragTopK: this.clampInteger(value.ragTopK, 1, 30, fallback.ragTopK),
      ragMaxContextCharacters: this.clampInteger(
        value.ragMaxContextCharacters,
        1000,
        100000,
        fallback.ragMaxContextCharacters,
      ),
    };
  }

  public static normalizeMode(
    value: unknown,
    fallback: AtlasContextProfileMode = "balanced",
  ): AtlasContextProfileMode {
    if (
      value === "light" ||
      value === "balanced" ||
      value === "advanced" ||
      value === "custom"
    ) {
      return value;
    }

    return fallback;
  }

  private static getPresetStaticAnalysis(
    mode: AtlasPresetMode,
  ): AtlasStaticAnalysisConfig {
    if (mode === "light" || mode === "balanced") {
      return {
        enabled: false,
        useInQuickAnalysis: false,
        useInArchitecturalAnalysis: false,
        useInRefactoring: false,
        includeDiagnostics: false,
        includeSymbolRelations: false,
      };
    }

    if (mode === "advanced") {
      return {
        enabled: true,
        useInQuickAnalysis: true,
        useInArchitecturalAnalysis: true,
        useInRefactoring: true,
        includeDiagnostics: true,
        includeSymbolRelations: true,
      };
    }

    return {
      enabled: true,
      useInQuickAnalysis: true,
      useInArchitecturalAnalysis: true,
      useInRefactoring: true,
      includeDiagnostics: false,
      includeSymbolRelations: false,
    };
  }

  private static isPresetMode(
    mode: AtlasContextProfileMode,
  ): mode is AtlasPresetMode {
    return mode === "light" || mode === "balanced" || mode === "advanced";
  }

  private static isProfileCandidate(
    value: unknown,
  ): value is Partial<AtlasContextProfileSettings> {
    return typeof value === "object" && value !== null;
  }

  private static clampInteger(
    value: unknown,
    minimum: number,
    maximum: number,
    fallback: number,
  ): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : Number.NaN;

    if (!Number.isInteger(parsed)) {
      return fallback;
    }

    return Math.max(minimum, Math.min(maximum, parsed));
  }
}
