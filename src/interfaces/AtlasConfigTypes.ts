export type JsonMap = Record<string, unknown>;

export type AtlasResponseLanguage = "pt-BR" | "en-US";
export type AtlasRagIndexingMode = "full" | "incremental";

export interface AtlasGeneralSettings {
  theme: string;
  language: AtlasResponseLanguage;
  autoSave: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface AtlasCloudConfigs {
  limitPayload: boolean;
  dynamicMaxTokens?: boolean;
  maxTokens: number;
  timeout: number;
  temperature: number;
  topP: number;
  stream: boolean;
}

export interface AtlasRagSettings {
  enabled: boolean;
  autoIndex: boolean;
  allowLocalContext: boolean;
  allowCloudContext: boolean;
  offlineOnly: boolean;
  chunkSize: number;
  chunkOverlap: number;
  ignoredPaths: string[];
  embeddingModel: string;
  embeddingModelsDir: string;
  topK: number;
  maxContextCharacters: number;
  maxFileSizeBytes: number;
  externalDocumentMaxFileSizeBytes: number;
  allowedExtensions: string[];
  respectGitIgnore: boolean;
  includeMarkdownFiles: boolean;
  includeConfigFiles: boolean;
  indexingMode: AtlasRagIndexingMode;
  promptIndexOnChange: boolean;
  indexOnStartup: boolean;
  promptBeforeStartupIndex: boolean;
  autoIndexDebounceMs: number;
  relevanceMode: "maxDistance" | "minRelevance";
  relevanceThreshold: number;
  maxChunksPerFile: number;
  diversifyFiles: boolean;
  excludeActiveFile: boolean;
  includeExternalDocuments: boolean;
  useInCodeEditing: boolean;
  sourcePriority: "code" | "documentation" | "balanced";
  languageFilters: string[];
  directoryFilters: string[];
  showSources: boolean;
}

export interface AtlasEngineSettings {
  mode: "local" | "cloud";
  preferGpu: boolean;
  fallbackToCpu: boolean;
}

export interface AtlasUiSettings {
  defaultView: string;
  showTips: boolean;
}

export interface AtlasLlmDefaults {
  temperature: number;
  maxTokens: number;
  topP: number;
  stream: boolean;
}

export interface AtlasModelParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  gpuLayers?: number;
  contextWindow?: number;
  seed?: number;
  stopSequences?: string[];
  [key: string]: unknown;
}

export interface AtlasModelMetadata {
  installedAt?: string;
  updatedAt?: string;
  source?: string;
  tags?: string[];
  description?: string;
  [key: string]: unknown;
}

export interface AtlasModelConfig {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  source: "local" | "cloud";
  path?: string;
  apiModelName?: string;
  baseUrl?: string;
  parameters: AtlasModelParameters;
  metadata?: AtlasModelMetadata;
  custom?: JsonMap;
}

export interface AtlasLlmSelection {
  mode: "local" | "cloud";

  local: {
    activeModelId: string | null;
  };

  cloud: {
    providerId: string | null;
    activeModelId: string | null;
  };
}

export interface AtlasLlmSettings {
  selection: AtlasLlmSelection;
  defaults: AtlasLlmDefaults;
  localModels: Record<string, AtlasModelConfig>;
}

export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKeyPlaceholder: string;
  kind?: "openai-compatible" | "claude" | "gemini";
}

export interface AtlasStudyModeConfig {
  enabled: boolean;
}

export interface AtlasRefactoringConfig {
  enabled: boolean;
}

export interface AtlasStaticAnalysisConfig {
  enabled: boolean;
  useInQuickAnalysis: boolean;
  useInArchitecturalAnalysis: boolean;
  useInRefactoring: boolean;
  includeDiagnostics: boolean;
  includeSymbolRelations: boolean;
}

export type AtlasContextProfileMode =
  | "light"
  | "balanced"
  | "advanced"
  | "custom";

export interface AtlasContextProfileSettings {
  mode: AtlasContextProfileMode;
  historyWindowSize: number;
  includeArchitecturalMemory: boolean;
  includeRagContext: boolean;
  includeEditorContext: boolean;
  maxEditorContextCharacters: number;
  includeStaticAnalysis: boolean;
  ragTopK: number;
  ragMaxContextCharacters: number;
}

export interface AtlasLocalEngineCustomConfig {
  engineType?: "cpu" | "cuda" | "vulkan";
  startOnAtlasOpen?: boolean;
  prepareOnAtlasOpen?: boolean;
  enginesDir?: string;
  llamaServerPath?: string;
  dynamicContextWindow?: boolean;
  stream?: boolean;
  timeout?: number;
  [key: string]: unknown;
}

export interface AtlasCustomSettings {
  studyMode?: AtlasStudyModeConfig;
  refactoring?: AtlasRefactoringConfig;
  staticAnalysis?: AtlasStaticAnalysisConfig;
  contextProfile?: AtlasContextProfileSettings;
  localEngine?: AtlasLocalEngineCustomConfig;
  saveInterruptedResponses?: boolean;

  // mantém flexível para futuras extensões
  [key: string]: unknown;
}

export interface AtlasConfigSchema {
  version: string;
  updatedAt: string;

  general: AtlasGeneralSettings;
  cloudConfigs: AtlasCloudConfigs;
  rag: AtlasRagSettings;
  ui: AtlasUiSettings;

  llms: AtlasLlmSettings;

  custom?: AtlasCustomSettings;
  providers?: ProviderConfig[];
}
export type AtlasExecutionMode = "local" | "cloud";

export interface AtlasResolvedCloudSelection {
  mode: "cloud";
  provider: ProviderConfig;
  modelId: string;
}

export interface AtlasResolvedLocalSelection {
  mode: "local";
  model: AtlasModelConfig;
}

export type AtlasResolvedSelection =
  | AtlasResolvedLocalSelection
  | AtlasResolvedCloudSelection;
