import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";
import { ATLAS_LOCAL_MODEL_DEFAULTS } from "./AtlasLocalModelDefaults";
import { getAtlasStoragePath } from "../utils/AtlasStoragePaths";

export class AtlasLocalModelDiscoveryService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public refreshLocalModels(): AtlasModelConfig[] {
    const modelsDir = this.getModelsDir();
    this.ensureModelsDir();

    const discoveredModels = fs
      .readdirSync(modelsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .filter((entry) => entry.name.toLowerCase().endsWith(".gguf"))
      .map((entry) => this.createModelConfig(entry.name));

    for (const model of discoveredModels) {
      const existing = this.configManager.getLocalModel(model.id);

      if (!existing || this.shouldUpsertDiscoveredModel(existing, model)) {
        this.configManager.upsertModel(model);
      }
    }

    const discoveredIds = new Set(discoveredModels.map((model) => model.id));
    const localModels = this.configManager
      .getLocalModels()
      .filter((model) => discoveredIds.has(model.id));

    const activeModel = this.configManager.getActiveLocalModel();
    if (activeModel && !discoveredIds.has(activeModel.id)) {
      this.configManager.setActiveLocalModel(localModels[0]?.id ?? null);
    } else if (!activeModel && localModels.length > 0) {
      this.configManager.setActiveLocalModel(localModels[0].id);
    }

    return localModels;
  }

  public getModelsDir(): string {
    const configured = this.getConfiguredModelsDir();
    const modelsDir = configured || getAtlasStoragePath(this.context, "models");

    this.ensureModelsDir(modelsDir);
    return modelsDir;
  }

  private ensureModelsDir(modelsDir = this.getModelsDir()): void {
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
  }

  private createModelConfig(fileName: string): AtlasModelConfig {
    const modelsDir = this.getModelsDir();
    const filePath = path.join(modelsDir, fileName);
    const stat = fs.statSync(filePath);
    const modelName = path.basename(fileName, path.extname(fileName));
    const modelId = `local/${modelName}`;
    const existing = this.configManager.getLocalModel(modelId);

    return {
      id: modelId,
      name: existing?.name ?? modelName,
      provider: existing?.provider ?? this.inferProvider(modelName),
      enabled: existing?.enabled ?? true,
      source: "local",
      path: filePath,
      apiModelName: existing?.apiModelName ?? modelName,
      parameters: {
        ...ATLAS_LOCAL_MODEL_DEFAULTS,
        ...(existing?.parameters ?? {}),
      },
      metadata: {
        ...(existing?.metadata ?? {}),
        source: existing?.metadata?.source ?? "models-folder",
        tags: existing?.metadata?.tags ?? [this.inferTag(modelName)],
        quantization:
          existing?.metadata?.quantization ?? this.inferQuantization(modelName),
        size: this.formatBytes(stat.size),
        installedAt:
          existing?.metadata?.installedAt ?? stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      },
      custom: {
        baseUrl: "http://127.0.0.1:8080/v1",
        engine: "llama.cpp",
        ...(existing?.custom ?? {}),
      },
    };
  }

  private shouldUpsertDiscoveredModel(
    existing: AtlasModelConfig,
    discovered: AtlasModelConfig,
  ): boolean {
    const existingMetadata = existing.metadata ?? {};
    const discoveredMetadata = discovered.metadata ?? {};
    const existingCustom = existing.custom ?? {};
    const discoveredCustom = discovered.custom ?? {};

    return (
      existing.source !== discovered.source ||
      existing.path !== discovered.path ||
      existing.apiModelName !== discovered.apiModelName ||
      existingMetadata.source !== discoveredMetadata.source ||
      existingMetadata.quantization !== discoveredMetadata.quantization ||
      existingMetadata.size !== discoveredMetadata.size ||
      !this.areStringArraysEqual(
        existingMetadata.tags,
        discoveredMetadata.tags,
      ) ||
      existingCustom.baseUrl !== discoveredCustom.baseUrl ||
      existingCustom.engine !== discoveredCustom.engine
    );
  }

  private areStringArraysEqual(left: unknown, right: unknown): boolean {
    const leftValues = Array.isArray(left) ? left : [];
    const rightValues = Array.isArray(right) ? right : [];

    if (leftValues.length !== rightValues.length) {
      return false;
    }

    return leftValues.every((value, index) => value === rightValues[index]);
  }

  private inferTag(modelName: string): string {
    const match = modelName.match(/(?:^|[-_])(\d+(?:\.\d+)?b)(?:[-_]|$)/i);
    return match?.[1]?.toUpperCase() ?? "GGUF";
  }

  private inferQuantization(modelName: string): string {
    const match = modelName.match(
      /(?:^|[-_.])((?:IQ|Q)\d(?:_\d)?(?:_[A-Z]+){0,3})(?:[-_.]|$)/i,
    );

    return match?.[1]?.toUpperCase() ?? "-";
  }

  private inferProvider(modelName: string): string {
    const normalized = modelName.toLowerCase();

    if (normalized.includes("gemma") || normalized.includes("google")) {
      return "Google";
    }

    if (normalized.includes("llama") || normalized.includes("meta")) {
      return "Meta";
    }

    if (normalized.includes("qwen")) {
      return "Qwen";
    }

    if (normalized.includes("mistral") || normalized.includes("mixtral")) {
      return "Mistral AI";
    }

    if (normalized.includes("phi")) {
      return "Microsoft";
    }

    return "Local";
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  private getConfiguredModelsDir(): string {
    const localModels = this.configManager.getConfig().custom?.localModels;

    if (typeof localModels !== "object" || localModels === null) {
      return "";
    }

    const modelsDir = (localModels as Record<string, unknown>).modelsDir;

    return typeof modelsDir === "string" ? modelsDir.trim() : "";
  }
}
