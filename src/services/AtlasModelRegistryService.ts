import {
  AtlasConfigSchema,
  AtlasModelConfig,
} from "../interfaces/AtlasConfigTypes";
import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";

export class AtlasModelRegistryService {
  constructor(private readonly repository: AtlasConfigRepository) {}

  public getAllModels(): Record<string, AtlasModelConfig> {
    return this.repository.load().llms.localModels;
  }

  public getLocalModel(modelId: string): AtlasModelConfig | null {
    const config = this.repository.load();
    return config.llms.localModels[modelId] ?? null;
  }

  public getLocalModels(): AtlasModelConfig[] {
    const config = this.repository.load();
    return Object.values(config.llms.localModels);
  }

  public upsertModel(model: AtlasModelConfig): AtlasConfigSchema {
    const config = this.repository.load();
    const existing = config.llms.localModels[model.id];

    config.llms.localModels[model.id] = {
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
    this.repository.save(config);
    return config;
  }

  public updateModel(
    modelId: string,
    partialData: Partial<AtlasModelConfig>,
  ): AtlasConfigSchema {
    const config = this.repository.load();
    const existing = config.llms.localModels[modelId];

    if (!existing) {
      throw new Error(`Modelo "${modelId}" não encontrado.`);
    }

    config.llms.localModels[modelId] = {
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
    this.repository.save(config);
    return config;
  }

  public removeModel(modelId: string): AtlasConfigSchema {
    const config = this.repository.load();

    if (config.llms.selection.local.activeModelId === modelId) {
      config.llms.selection.local.activeModelId = null;
    }

    delete config.llms.localModels[modelId];

    config.updatedAt = new Date().toISOString();
    this.repository.save(config);
    return config;
  }
}
