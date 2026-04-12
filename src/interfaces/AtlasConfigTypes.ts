export type JsonMap = Record<string, unknown>;

export interface AtlasGeneralSettings {
  theme: string;
  language: string;
  autoSave: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface AtlasSecuritySettings {
  confirmCloud: boolean;
  blockRag: boolean;
  limitPayload: boolean;
  maxTokens?: number;
  timeout?: number;
}

export interface AtlasRagSettings {
  enabled: boolean;
  autoIndex: boolean;
  allowCloudContext: boolean;
  offlineOnly: boolean;
  chunkSize: number;
  chunkOverlap: number;
  ignoredPaths: string[];
}

export interface AtlasRuntimeSettings {
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
}

export interface AtlasConfigSchema {
  version: string;
  updatedAt: string;

  general: AtlasGeneralSettings;
  cloudSecurity: AtlasSecuritySettings;
  rag: AtlasRagSettings;
  ui: AtlasUiSettings;

  llms: AtlasLlmSettings;

  custom?: JsonMap;
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
