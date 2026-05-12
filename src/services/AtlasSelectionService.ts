import {
  AtlasConfigSchema,
  AtlasExecutionMode,
  AtlasResolvedCloudSelection,
  AtlasResolvedLocalSelection,
  AtlasResolvedSelection,
} from "../interfaces/AtlasConfigTypes";
import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";
import { AtlasProviderService } from "./AtlasProviderService";
import { AtlasModelRegistryService } from "./AtlasModelRegistryService";

export class AtlasSelectionService {
  constructor(
    private readonly repository: AtlasConfigRepository,
    private readonly providerService: AtlasProviderService,
    private readonly modelRegistry: AtlasModelRegistryService,
  ) {}

  public getCurrentMode(): AtlasExecutionMode {
    return this.repository.load().llms.selection.mode;
  }

  public isCloudMode(): boolean {
    return this.getCurrentMode() === "cloud";
  }

  public isLocalMode(): boolean {
    return this.getCurrentMode() === "local";
  }

  public setMode(mode: "local" | "cloud"): AtlasConfigSchema {
    const config = this.repository.load();

    config.llms.selection.mode = mode;
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public setActiveLocalModel(modelId: string | null): AtlasConfigSchema {
    const config = this.repository.load();

    if (modelId !== null) {
      const model = config.llms.localModels[modelId];

      if (!model) {
        throw new Error(`Modelo "${modelId}" não encontrado.`);
      }
    }

    config.llms.selection.mode = "local";
    config.llms.selection.local.activeModelId = modelId;
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public setSelectedCloudProvider(
    providerId: string | null,
  ): AtlasConfigSchema {
    const config = this.repository.load();

    if (providerId !== null) {
      const providerExists = (config.providers ?? []).some(
        (p) => p.id === providerId,
      );

      if (!providerExists) {
        throw new Error(`Provedor "${providerId}" não encontrado.`);
      }
    }

    const previousProviderId = config.llms.selection.cloud.providerId;

    config.llms.selection.mode = "cloud";
    config.llms.selection.cloud.providerId = providerId;

    if (previousProviderId !== providerId) {
      config.llms.selection.cloud.activeModelId = null;
    }
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public setActiveCloudModel(modelId: string | null): AtlasConfigSchema {
    const config = this.repository.load();

    if (modelId !== null) {
      const providerId = config.llms.selection.cloud.providerId;

      if (!providerId) {
        throw new Error("Nenhum provedor em nuvem foi selecionado.");
      }
    }

    config.llms.selection.mode = "cloud";
    config.llms.selection.cloud.activeModelId = modelId;
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public getActiveLocalModel() {
    const config = this.repository.load();
    const modelId = config.llms.selection.local.activeModelId;

    if (!modelId) {
      return null;
    }

    return config.llms.localModels[modelId] ?? null;
  }

  public getSelectedCloudSelection(): {
    providerId: string;
    modelId: string;
  } | null {
    const config = this.repository.load();
    const providerId = config.llms.selection.cloud.providerId;
    const modelId = config.llms.selection.cloud.activeModelId;

    if (!providerId || !modelId) {
      return null;
    }

    return { providerId, modelId };
  }

  public getSelectedCloudProviderId(): string | null {
    return this.repository.load().llms.selection.cloud.providerId;
  }

  public getSelectedCloudModelId(): string | null {
    return this.repository.load().llms.selection.cloud.activeModelId;
  }

  public getResolvedCloudSelection(): AtlasResolvedCloudSelection | null {
    const config = this.repository.load();

    if (config.llms.selection.mode !== "cloud") {
      return null;
    }

    const { providerId, activeModelId } = config.llms.selection.cloud;

    if (!providerId || !activeModelId) {
      return null;
    }

    const provider = this.providerService.getProvider(providerId);

    if (!provider) {
      throw new Error(`Provedor "${providerId}" não encontrado.`);
    }

    return {
      mode: "cloud",
      provider,
      modelId: activeModelId,
    };
  }

  public getResolvedLocalSelection(): AtlasResolvedLocalSelection | null {
    const config = this.repository.load();

    if (config.llms.selection.mode !== "local") {
      return null;
    }

    const modelId = config.llms.selection.local.activeModelId;

    if (!modelId) {
      return null;
    }

    const model = this.modelRegistry.getLocalModel(modelId);

    if (!model) {
      throw new Error(`Modelo "${modelId}" não encontrado.`);
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
}
