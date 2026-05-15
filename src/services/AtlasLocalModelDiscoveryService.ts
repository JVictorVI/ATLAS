import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";

export class AtlasLocalModelDiscoveryService {
  private readonly modelsDir: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
  ) {
    this.modelsDir = path.join(this.context.extensionPath, "models");
  }

  public refreshLocalModels(): AtlasModelConfig[] {
    this.ensureModelsDir();

    const discoveredModels = fs
      .readdirSync(this.modelsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .filter((entry) => entry.name.toLowerCase().endsWith(".gguf"))
      .map((entry) => this.createModelConfig(entry.name));

    for (const model of discoveredModels) {
      this.configManager.upsertModel(model);
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
    this.ensureModelsDir();
    return this.modelsDir;
  }

  private ensureModelsDir(): void {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  private createModelConfig(fileName: string): AtlasModelConfig {
    const filePath = path.join(this.modelsDir, fileName);
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
        temperature: 0.7,
        maxTokens: 1024,
        topP: 0.95,
        gpuLayers: 0,
        contextWindow: 4096,
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
        runtime: "llama.cpp",
        ...(existing?.custom ?? {}),
      },
    };
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
}
