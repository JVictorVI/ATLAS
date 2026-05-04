import {
  AtlasConfigSchema,
  AtlasGeneralSettings,
  AtlasLlmDefaults,
  AtlasRagSettings,
  AtlasSecuritySettings,
  AtlasUiSettings,
  JsonMap,
} from "../interfaces/AtlasConfigTypes";
import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";

export class AtlasSettingsService {
  constructor(private readonly repository: AtlasConfigRepository) {}

  public getConfig(): AtlasConfigSchema {
    return this.repository.load();
  }

  public saveConfig(config: AtlasConfigSchema): void {
    const normalized: AtlasConfigSchema = {
      ...config,
      updatedAt: new Date().toISOString(),
    };

    this.repository.save(normalized);
  }

  public resetConfig(): AtlasConfigSchema {
    return this.repository.reset();
  }

  public getSection<K extends keyof AtlasConfigSchema>(
    section: K,
  ): AtlasConfigSchema[K] {
    return this.getConfig()[section];
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

    this.repository.save(updated);
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

    config.llms.defaults = {
      ...config.llms.defaults,
      ...defaults,
    };

    config.updatedAt = new Date().toISOString();
    this.repository.save(config);
    return config;
  }

  public updateCustomRoot(customData: JsonMap): AtlasConfigSchema {
    const config = this.getConfig();

    config.custom = {
      ...(config.custom ?? {}),
      ...customData,
    };

    config.updatedAt = new Date().toISOString();
    this.repository.save(config);
    return config;
  }
}
