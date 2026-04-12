import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasConfigDefaults } from "./AtlasConfigDefaults";
import { AtlasConfigSchema } from "../interfaces/AtlasConfigTypes";

export class AtlasConfigRepository {
  private readonly configDirPath: string;
  private readonly configFilePath: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly defaults: AtlasConfigDefaults,
  ) {
    this.configDirPath = path.join(this.context.extensionPath, "config");
    this.configFilePath = path.join(this.configDirPath, "atlas-config.json");
  }

  public load(): AtlasConfigSchema {
    this.ensureConfigFile();

    try {
      const raw = fs.readFileSync(this.configFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AtlasConfigSchema>;
      return this.defaults.mergeWithDefaults(parsed);
    } catch {
      const fallback = this.defaults.createDefaultConfig();
      this.save(fallback);
      return fallback;
    }
  }

  public save(config: AtlasConfigSchema): void {
    this.ensureConfigDir();

    fs.writeFileSync(
      this.configFilePath,
      JSON.stringify(config, null, 2),
      "utf8",
    );
  }

  public reset(): AtlasConfigSchema {
    const defaultsConfig = this.defaults.createDefaultConfig();
    this.save(defaultsConfig);
    return defaultsConfig;
  }

  private ensureConfigFile(): void {
    this.ensureConfigDir();

    if (!fs.existsSync(this.configFilePath)) {
      this.save(this.defaults.createDefaultConfig());
    }
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDirPath)) {
      fs.mkdirSync(this.configDirPath, { recursive: true });
    }
  }
}
