import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

type JsonMap = Record<string, unknown>;

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
  provider: string;
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
    modelId: string | null;
  };
  cloud: {
    providerId: string | null;
    modelId: string | null;
  };
}

export interface AtlasLlmSettings {
  selection: AtlasLlmSelection;
  defaults: AtlasLlmDefaults;
  models: Record<string, AtlasModelConfig>;
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
  runtime: AtlasRuntimeSettings;
  ui: AtlasUiSettings;
  llm: AtlasLlmSettings;
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

export class AtlasConfigManager {
  private readonly configDirPath: string;
  private readonly configFilePath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.configDirPath = path.join(this.context.extensionPath, "config");
    this.configFilePath = path.join(this.configDirPath, "atlas-config.json");
  }

  public ensureConfigFile(): void {
    if (!fs.existsSync(this.configDirPath)) {
      fs.mkdirSync(this.configDirPath, { recursive: true });
    }

    if (!fs.existsSync(this.configFilePath)) {
      this.writeConfig(this.createDefaultConfig());
    }
  }

  public getConfig(): AtlasConfigSchema {
    this.ensureConfigFile();

    try {
      const raw = fs.readFileSync(this.configFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AtlasConfigSchema>;
      return this.mergeWithDefaults(parsed);
    } catch {
      const fallback = this.createDefaultConfig();
      this.writeConfig(fallback);
      return fallback;
    }
  }

  public saveConfig(config: AtlasConfigSchema): void {
    const normalized: AtlasConfigSchema = {
      ...config,
      updatedAt: new Date().toISOString(),
    };

    this.writeConfig(normalized);
  }

  public resetConfig(): AtlasConfigSchema {
    const defaults = this.createDefaultConfig();
    this.writeConfig(defaults);
    return defaults;
  }

  public getSection<K extends keyof AtlasConfigSchema>(
    section: K,
  ): AtlasConfigSchema[K] {
    const config = this.getConfig();
    return config[section];
  }

  public updateSection<K extends keyof AtlasConfigSchema>(
    section: K,
    partialData: Partial<AtlasConfigSchema[K]>,
  ): AtlasConfigSchema {
    const current = this.getConfig();

    const currentSection = current[section];
    if (
      typeof currentSection !== "object" ||
      currentSection === null ||
      Array.isArray(currentSection)
    ) {
      throw new Error(
        `A seção "${String(section)}" não é atualizável como objeto.`,
      );
    }

    const updated: AtlasConfigSchema = {
      ...current,
      [section]: {
        ...(currentSection as object),
        ...(partialData as object),
      } as AtlasConfigSchema[K],
      updatedAt: new Date().toISOString(),
    };

    this.writeConfig(updated);
    return updated;
  }

  public updateSecuritySettings(
    settings: Partial<AtlasSecuritySettings>,
  ): AtlasConfigSchema {
    return this.updateSection("cloudSecurity", settings);
  }

  public updateRagSettings(
    settings: Partial<AtlasRagSettings>,
  ): AtlasConfigSchema {
    return this.updateSection("rag", settings);
  }

  public updateRuntimeSettings(
    settings: Partial<AtlasRuntimeSettings>,
  ): AtlasConfigSchema {
    return this.updateSection("runtime", settings);
  }

  public updateUiSettings(
    settings: Partial<AtlasUiSettings>,
  ): AtlasConfigSchema {
    return this.updateSection("ui", settings);
  }

  public updateGeneralSettings(
    settings: Partial<AtlasGeneralSettings>,
  ): AtlasConfigSchema {
    return this.updateSection("general", settings);
  }

  public updateLlmDefaults(
    defaults: Partial<AtlasLlmDefaults>,
  ): AtlasConfigSchema {
    const config = this.getConfig();

    config.llm.defaults = {
      ...config.llm.defaults,
      ...defaults,
    };

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  public updateProvider(
    providerId: string,
    partialData: Partial<ProviderConfig>,
  ): AtlasConfigSchema {
    const config = this.getConfig();
    const providers = config.providers ?? [];

    const index = providers.findIndex((p) => p.id === providerId);

    if (index === -1) {
      throw new Error(`Provedor "${providerId}" não encontrado.`);
    }

    const currentProvider = providers[index];

    const updatedProvider: ProviderConfig = {
      ...currentProvider,
      ...partialData,
      id: currentProvider.id,
    };

    providers[index] = updatedProvider;

    config.providers = providers;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public getCurrentMode(): AtlasExecutionMode {
    const config = this.getConfig();

    if (config.llm.selection.mode !== config.runtime.mode) {
      return config.llm.selection.mode;
    }

    return config.runtime.mode;
  }

  public isCloudMode(): boolean {
    return this.getCurrentMode() === "cloud";
  }

  public isLocalMode(): boolean {
    return this.getCurrentMode() === "local";
  }

  public getLocalModel(modelId: string): AtlasModelConfig | null {
    const config = this.getConfig();
    return config.llm.models[modelId] ?? null;
  }

  public getResolvedCloudSelection(): AtlasResolvedCloudSelection | null {
    const config = this.getConfig();

    if (config.llm.selection.mode !== "cloud") {
      return null;
    }

    const { providerId, modelId } = config.llm.selection.cloud;

    if (!providerId || !modelId) {
      return null;
    }

    const provider = this.getProvider(providerId);

    if (!provider) {
      throw new Error(`Provedor "${providerId}" não encontrado.`);
    }

    return {
      mode: "cloud",
      provider,
      modelId,
    };
  }

  public getResolvedLocalSelection(): AtlasResolvedLocalSelection | null {
    const config = this.getConfig();

    if (config.llm.selection.mode !== "local") {
      return null;
    }

    const modelId = config.llm.selection.local.modelId;

    if (!modelId) {
      return null;
    }

    const model = this.getLocalModel(modelId);

    if (!model) {
      throw new Error(`Modelo "${modelId}" não encontrado.`);
    }

    if (model.source !== "local") {
      throw new Error(`O modelo "${modelId}" não é um modelo local.`);
    }

    if (!model.enabled) {
      throw new Error(`O modelo "${model.name}" está desabilitado.`);
    }

    return {
      mode: "local",
      model,
    };
  }

  public getResolvedSelectionForCurrentMode(): AtlasResolvedSelection | null {
    return this.isCloudMode()
      ? this.getResolvedCloudSelection()
      : this.getResolvedLocalSelection();
  }

  public upsertModel(model: AtlasModelConfig): AtlasConfigSchema {
    const config = this.getConfig();

    const existing = config.llm.models[model.id];

    config.llm.models[model.id] = {
      ...existing,
      ...model,
      parameters: {
        ...(existing?.parameters ?? {}),
        ...(model.parameters ?? {}),
      },
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(model.metadata ?? {}),
        updatedAt: new Date().toISOString(),
      },
      custom: {
        ...(existing?.custom ?? {}),
        ...(model.custom ?? {}),
      },
    };

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  public updateModel(
    modelId: string,
    partialData: Partial<AtlasModelConfig>,
  ): AtlasConfigSchema {
    const config = this.getConfig();
    const existing = config.llm.models[modelId];

    if (!existing) {
      throw new Error(`Modelo "${modelId}" não encontrado.`);
    }

    config.llm.models[modelId] = {
      ...existing,
      ...partialData,
      parameters: {
        ...existing.parameters,
        ...(partialData.parameters ?? {}),
      },
      metadata: {
        ...(existing.metadata ?? {}),
        ...(partialData.metadata ?? {}),
        updatedAt: new Date().toISOString(),
      },
      custom: {
        ...(existing.custom ?? {}),
        ...(partialData.custom ?? {}),
      },
    };

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  public removeModel(modelId: string): AtlasConfigSchema {
    const config = this.getConfig();

    if (config.llm.selection.local.modelId === modelId) {
      config.llm.selection.local.modelId = null;
    }

    if (config.llm.selection.cloud.modelId === modelId) {
      config.llm.selection.cloud.modelId = null;
    }

    delete config.llm.models[modelId];

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  public getSelectedCloudModelId(): string | null {
    return this.getConfig().llm.selection.cloud.modelId;
  }

  public getSelectedCloudProviderId(): string | null {
    return this.getConfig().llm.selection.cloud.providerId;
  }

  public getAllModels(): Record<string, AtlasModelConfig> {
    const config = this.getConfig();
    return config.llm.models;
  }

  public getProvider(providerId: string): ProviderConfig | null {
    const config = this.getConfig();
    const provider = config.providers?.find((p) => p.id === providerId);
    return provider ?? null;
  }

  public getSelectedProvider(): ProviderConfig | null {
    const config = this.getConfig();
    const providerId = config.llm.selection.cloud.providerId;
    if (!providerId) {
      return null;
    }
    const provider = config.providers?.find((p) => p.id === providerId);
    return provider ?? null;
  }

  public getAllProviders(): ProviderConfig[] {
    const config = this.getConfig();
    return config.providers ?? [];
  }

  public saveProviders(providers: ProviderConfig[]): AtlasConfigSchema {
    const config = this.getConfig();

    config.providers = providers;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public addProvider(provider: ProviderConfig): AtlasConfigSchema {
    const config = this.getConfig();
    const providers = config.providers ?? [];

    const alreadyExists = providers.some((p) => p.id === provider.id);
    if (alreadyExists) {
      throw new Error(`O provedor "${provider.label}" já existe.`);
    }

    config.providers = [...providers, provider];
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public updateCustomRoot(customData: JsonMap): AtlasConfigSchema {
    const config = this.getConfig();

    config.custom = {
      ...(config.custom ?? {}),
      ...customData,
    };

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  public setNestedValue(
    pathSegments: string[],
    value: unknown,
  ): AtlasConfigSchema {
    if (pathSegments.length === 0) {
      throw new Error("O caminho para atualização não pode ser vazio.");
    }

    const config = this.getConfig();
    const root = config as unknown as Record<string, unknown>;

    let current: Record<string, unknown> = root;

    for (let i = 0; i < pathSegments.length - 1; i++) {
      const key = pathSegments[i];
      const next = current[key];

      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        current[key] = {};
      }

      current = current[key] as Record<string, unknown>;
    }

    current[pathSegments[pathSegments.length - 1]] = value;

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  private writeConfig(config: AtlasConfigSchema): void {
    if (!fs.existsSync(this.configDirPath)) {
      fs.mkdirSync(this.configDirPath, { recursive: true });
    }

    fs.writeFileSync(
      this.configFilePath,
      JSON.stringify(config, null, 2),
      "utf8",
    );
  }

  private createDefaultConfig(): AtlasConfigSchema {
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
      runtime: {
        mode: "local",
        preferGpu: true,
        fallbackToCpu: true,
      },
      ui: {
        defaultView: "chat",
        showTips: true,
      },
      llm: {
        selection: {
          mode: "local",
          local: {
            modelId: null,
          },
          cloud: {
            providerId: null,
            modelId: null,
          },
        },
        defaults: {
          temperature: 0.2,
          maxTokens: 2048,
          topP: 0.95,
          stream: true,
          provider: "local",
        },
        models: {},
      },
      custom: {},
      providers: [
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
      ],
    };
  }

  private mergeWithDefaults(
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
      runtime: {
        ...defaults.runtime,
        ...(partial.runtime ?? {}),
      },
      ui: {
        ...defaults.ui,
        ...(partial.ui ?? {}),
      },
      llm: {
        ...defaults.llm,
        ...(partial.llm ?? {}),
        selection: {
          ...defaults.llm.selection,
          ...(partial.llm?.selection ?? {}),
          local: {
            ...defaults.llm.selection.local,
            ...(partial.llm?.selection?.local ?? {}),
          },
          cloud: {
            ...defaults.llm.selection.cloud,
            ...(partial.llm?.selection?.cloud ?? {}),
          },
        },
        defaults: {
          ...defaults.llm.defaults,
          ...(partial.llm?.defaults ?? {}),
        },
        models: {
          ...defaults.llm.models,
          ...(partial.llm?.models ?? {}),
        },
      },
      custom: {
        ...(defaults.custom ?? {}),
        ...(partial.custom ?? {}),
      },
      updatedAt: partial.updatedAt ?? defaults.updatedAt,
      version: partial.version ?? defaults.version,
    };
  }

  public setLlmMode(mode: "local" | "cloud"): AtlasConfigSchema {
    const config = this.getConfig();

    config.llm.selection.mode = mode;
    config.runtime.mode = mode;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public setSelectedLocalModel(modelId: string | null): AtlasConfigSchema {
    const config = this.getConfig();

    if (modelId !== null) {
      const model = config.llm.models[modelId];

      if (!model) {
        throw new Error(`Modelo "${modelId}" não encontrado.`);
      }

      if (model.source !== "local") {
        throw new Error(`O modelo "${modelId}" não é um modelo local.`);
      }
    }

    config.llm.selection.mode = "local";
    config.runtime.mode = "local";
    config.llm.selection.local.modelId = modelId;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public setSelectedCloudProvider(
    providerId: string | null,
  ): AtlasConfigSchema {
    const config = this.getConfig();

    if (providerId !== null) {
      const providerExists = (config.providers ?? []).some(
        (p) => p.id === providerId,
      );

      if (!providerExists) {
        throw new Error(`Provedor "${providerId}" não encontrado.`);
      }
    }

    config.llm.selection.mode = "cloud";
    config.runtime.mode = "cloud";
    config.llm.selection.cloud.providerId = providerId;
    config.llm.selection.cloud.modelId = null;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public setSelectedCloudModel(modelId: string | null): AtlasConfigSchema {
    const config = this.getConfig();

    if (modelId !== null) {
      const selectedProviderId = config.llm.selection.cloud.providerId;

      if (!selectedProviderId) {
        throw new Error("Nenhum provedor em nuvem foi selecionado.");
      }
    }

    config.llm.selection.mode = "cloud";
    config.runtime.mode = "cloud";
    config.llm.selection.cloud.modelId = modelId;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public getSelectedLocalModel(): AtlasModelConfig | null {
    const config = this.getConfig();
    const modelId = config.llm.selection.local.modelId;

    if (!modelId) {
      return null;
    }

    return config.llm.models[modelId] ?? null;
  }

  public getSelectedCloudSelection(): {
    providerId: string;
    modelId: string;
  } | null {
    const config = this.getConfig();
    const providerId = config.llm.selection.cloud.providerId;
    const modelId = config.llm.selection.cloud.modelId;

    if (!providerId || !modelId) {
      return null;
    }

    return { providerId, modelId };
  }

  public getCloudModelsBySelectedProvider(): AtlasModelConfig[] {
    const config = this.getConfig();
    const providerId = config.llm.selection.cloud.providerId;

    if (!providerId) {
      return [];
    }

    return Object.values(config.llm.models).filter(
      (model) => model.source === "cloud" && model.provider === providerId,
    );
  }

  public getLocalModels(): AtlasModelConfig[] {
    const config = this.getConfig();

    return Object.values(config.llm.models).filter(
      (model) => model.source === "local",
    );
  }
}
