import {
  AtlasConfigSchema,
  ProviderConfig,
} from "../interfaces/AtlasConfigTypes";
import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";

export class AtlasProviderService {
  constructor(private readonly repository: AtlasConfigRepository) {}

  public getAllProviders(): ProviderConfig[] {
    return this.repository.load().providers ?? [];
  }

  public getProvider(providerId: string): ProviderConfig | null {
    const config = this.repository.load();
    const provider = config.providers?.find((p) => p.id === providerId);
    return provider ?? null;
  }

  public getSelectedProvider(): ProviderConfig | null {
    const config = this.repository.load();
    const providerId = config.llms.selection.cloud.providerId;

    if (!providerId) {
      return null;
    }

    return config.providers?.find((p) => p.id === providerId) ?? null;
  }

  public saveProviders(providers: ProviderConfig[]): AtlasConfigSchema {
    const config = this.repository.load();

    config.providers = providers;
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public addProvider(provider: ProviderConfig): AtlasConfigSchema {
    const config = this.repository.load();
    const providers = config.providers ?? [];

    const alreadyExists = providers.some((p) => p.id === provider.id);
    if (alreadyExists) {
      throw new Error(`O provedor "${provider.label}" já existe.`);
    }

    config.providers = [...providers, provider];
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public updateProvider(
    providerId: string,
    partialData: Partial<ProviderConfig>,
  ): AtlasConfigSchema {
    const config = this.repository.load();
    const providers = config.providers ?? [];

    const index = providers.findIndex((p) => p.id === providerId);

    if (index === -1) {
      throw new Error(`Provedor "${providerId}" não encontrado.`);
    }

    const currentProvider = providers[index];

    providers[index] = {
      ...currentProvider,
      ...partialData,
      id: currentProvider.id,
    };

    config.providers = providers;
    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }

  public removeProvider(providerId: string): AtlasConfigSchema {
    const config = this.repository.load();
    const providers = config.providers ?? [];
    const filteredProviders = providers.filter((p) => p.id !== providerId);

    if (filteredProviders.length === providers.length) {
      throw new Error(`Provedor "${providerId}" nÃ£o encontrado.`);
    }

    config.providers = filteredProviders;

    if (config.llms.selection.cloud.providerId === providerId) {
      config.llms.selection.cloud.providerId = null;
      config.llms.selection.cloud.activeModelId = null;
    }

    config.updatedAt = new Date().toISOString();

    this.repository.save(config);
    return config;
  }
}
