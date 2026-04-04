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
  path?: string;
  apiModelName?: string;
  baseUrl?: string;
  parameters: AtlasModelParameters;
  metadata?: AtlasModelMetadata;
  custom?: JsonMap;
}

export interface AtlasLlmSettings {
  activeModelId: string | null;
  defaults: AtlasLlmDefaults;
  models: Record<string, AtlasModelConfig>;
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

export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKeyPlaceholder: string;
}

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

    if (config.llm.activeModelId === modelId) {
      config.llm.activeModelId = null;
    }

    delete config.llm.models[modelId];

    config.updatedAt = new Date().toISOString();
    this.writeConfig(config);
    return config;
  }

  public setActiveModel(modelId: string | null): AtlasConfigSchema {
    const config = this.getConfig();

    if (modelId !== null && !config.llm.models[modelId]) {
      throw new Error(
        `Não é possível ativar o modelo "${modelId}" porque ele não existe.`,
      );
    }

    config.llm.activeModelId = modelId;
    config.updatedAt = new Date().toISOString();

    this.writeConfig(config);
    return config;
  }

  public getModel(modelId: string): AtlasModelConfig | null {
    const config = this.getConfig();
    return config.llm.models[modelId] ?? null;
  }

  public getAllModels(): Record<string, AtlasModelConfig> {
    const config = this.getConfig();
    return config.llm.models;
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
        activeModelId: null,
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
}
