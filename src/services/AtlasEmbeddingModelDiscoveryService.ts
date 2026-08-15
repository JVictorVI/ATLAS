import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { RagEmbeddingModelInfo } from "../interfaces/AtlasRagTypes";

const DEFAULT_EMBEDDING_MODEL_ID = "atlas-embedding";
const DEFAULT_EMBEDDING_MODEL_BASE_URL =
  "https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main";
const DEFAULT_EMBEDDING_MODEL_FILES = [
  "config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "unigram.json",
  "onnx/model_quantized.onnx",
];
const DEFAULT_EMBEDDING_MODEL_METADATA = {
  name: "Modelo padrão (paraphrase-multilingual-MiniLM-L12-v2)",
  source: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  revision: "main",
  task: "feature-extraction",
  dimensions: 384,
  quantization: "int8",
};

type AtlasEmbeddingModelMetadata = {
  name?: string;
  source?: string;
  task?: string;
  dimensions?: number;
  quantization?: string;
};

type ActiveEmbeddingModelPath = {
  id: string;
  path: string;
};

export type EmbeddingModelDownloadProgress = {
  fileName: string;
  processedFiles: number;
  totalFiles: number;
  skipped: boolean;
};

export class AtlasEmbeddingModelDiscoveryService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public refreshEmbeddingModels(): RagEmbeddingModelInfo[] {
    const models = new Map<string, RagEmbeddingModelInfo>();

    for (const root of this.getDiscoveryRoots()) {
      for (const model of this.discoverModels(root.path, root.source)) {
        if (!models.has(model.id)) {
          models.set(model.id, model);
        }
      }
    }

    return Array.from(models.values()).sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "custom" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, "pt-BR");
    });
  }

  public getModelsDir(): string {
    const modelsDir =
      this.getConfiguredModelsDir() || this.getDefaultUserModelsDir();

    this.ensureDirectory(modelsDir);
    return modelsDir;
  }

  public getBundledModelsDir(): string {
    return path.join(this.context.extensionPath, "resources", "embeddings");
  }

  public getDefaultUserModelsDir(): string {
    return path.join(
      this.context.globalStorageUri.fsPath,
      "rag",
      "embedding-models",
    );
  }

  public async downloadDefaultEmbeddingModel(
    onProgress?: (progress: EmbeddingModelDownloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<RagEmbeddingModelInfo> {
    const destinationRoot = path.join(
      this.getModelsDir(),
      DEFAULT_EMBEDDING_MODEL_ID,
    );

    for (
      let index = 0;
      index < DEFAULT_EMBEDDING_MODEL_FILES.length;
      index += 1
    ) {
      this.throwIfAborted(signal);

      const relativePath = DEFAULT_EMBEDDING_MODEL_FILES[index];
      const destination = path.join(destinationRoot, relativePath);
      const skipped = this.isFile(destination);

      onProgress?.({
        fileName: relativePath,
        processedFiles: index,
        totalFiles: DEFAULT_EMBEDDING_MODEL_FILES.length,
        skipped,
      });

      if (!skipped) {
        await fs.promises.mkdir(path.dirname(destination), {
          recursive: true,
        });
        const response = await fetch(
          `${DEFAULT_EMBEDDING_MODEL_BASE_URL}/${relativePath}`,
          { signal },
        );

        if (!response.ok) {
          throw new Error(
            `Falha ao baixar ${relativePath}: HTTP ${response.status}`,
          );
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        this.throwIfAborted(signal);
        await fs.promises.writeFile(destination, bytes);
      }

      onProgress?.({
        fileName: relativePath,
        processedFiles: index + 1,
        totalFiles: DEFAULT_EMBEDDING_MODEL_FILES.length,
        skipped,
      });
    }

    await fs.promises.writeFile(
      path.join(destinationRoot, "atlas-model.json"),
      JSON.stringify(DEFAULT_EMBEDDING_MODEL_METADATA, null, 2),
      "utf8",
    );

    return this.createModelInfo(destinationRoot, "custom");
  }

  public resolveActiveModel(): RagEmbeddingModelInfo {
    const activeModel = this.resolveActiveModelPath();
    const source = this.resolveModelSource(activeModel.path);

    return this.createModelInfo(activeModel.path, source);
  }

  public resolveActiveModelPath(): ActiveEmbeddingModelPath {
    const modelId = this.configManager.getConfig().rag.embeddingModel;

    for (const root of this.getDiscoveryRoots()) {
      if (
        path.basename(root.path) === modelId &&
        this.isEmbeddingModelDirectory(root.path)
      ) {
        return {
          id: modelId,
          path: root.path,
        };
      }

      const candidatePath = path.join(root.path, modelId);

      if (this.isEmbeddingModelDirectory(candidatePath)) {
        return {
          id: modelId,
          path: candidatePath,
        };
      }
    }

    const candidatePaths = this.getDiscoveryRoots()
      .map((root) => path.join(root.path, modelId))
      .join(" ou ");

    throw new Error(
      `Modelo local de embeddings não encontrado: ${candidatePaths}`,
    );
  }

  public isKnownModel(modelId: string): boolean {
    return this.refreshEmbeddingModels().some((model) => model.id === modelId);
  }

  public deleteEmbeddingModel(modelId: string): RagEmbeddingModelInfo[] {
    const model = this.refreshEmbeddingModels().find(
      (candidate) => candidate.id === modelId,
    );

    if (!model) {
      throw new Error("Modelo de embeddings não encontrado.");
    }

    const modelsDir = path.resolve(
      model.source === "bundled"
        ? this.getBundledModelsDir()
        : this.getModelsDir(),
    );
    const modelPath = path.resolve(model.path);
    const relative = path.relative(modelsDir, modelPath);

    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        "Por segurança, apenas subpastas dentro da raiz correspondente de modelos de embeddings podem ser excluídas.",
      );
    }

    fs.rmSync(modelPath, { force: true, recursive: true });
    return this.refreshEmbeddingModels();
  }

  private resolveModelSource(
    modelPath: string,
  ): RagEmbeddingModelInfo["source"] {
    const configured = this.getConfiguredModelsDir();
    const userRoot = configured || this.getDefaultUserModelsDir();

    if (userRoot) {
      const relative = path.relative(path.resolve(userRoot), path.resolve(modelPath));

      if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
        return "custom";
      }
    }

    return "bundled";
  }

  private getDiscoveryRoots(): Array<{
    path: string;
    source: RagEmbeddingModelInfo["source"];
  }> {
    const roots: Array<{
      path: string;
      source: RagEmbeddingModelInfo["source"];
    }> = [];
    const configured = this.getConfiguredModelsDir();

    if (configured) {
      this.ensureDirectory(configured);
      return [{ path: configured, source: "custom" }];
    }

    const userModelsDir = this.getDefaultUserModelsDir();

    this.ensureDirectory(userModelsDir);
    roots.push({ path: userModelsDir, source: "custom" });

    const bundled = this.getBundledModelsDir();

    if (
      !roots.some(
        (root) => path.resolve(root.path) === path.resolve(bundled),
      )
    ) {
      roots.push({ path: bundled, source: "bundled" });
    }

    return roots;
  }

  private discoverModels(
    rootPath: string,
    source: RagEmbeddingModelInfo["source"],
  ): RagEmbeddingModelInfo[] {
    if (!this.isDirectory(rootPath)) {
      return [];
    }

    if (this.isEmbeddingModelDirectory(rootPath)) {
      return [this.createModelInfo(rootPath, source)];
    }

    return fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name))
      .filter((modelPath) => this.isEmbeddingModelDirectory(modelPath))
      .map((modelPath) => this.createModelInfo(modelPath, source));
  }

  private createModelInfo(
    modelPath: string,
    source: RagEmbeddingModelInfo["source"],
  ): RagEmbeddingModelInfo {
    const metadata = this.readModelMetadata(modelPath);
    const stat = fs.statSync(modelPath);
    const sizeBytes = this.getDirectorySize(modelPath);
    const id = path.basename(modelPath);

    return {
      id,
      name: this.getModelDisplayName(id, metadata),
      path: modelPath,
      source,
      sizeBytes,
      sizeLabel: this.formatBytes(sizeBytes),
      updatedAt: stat.mtime.toISOString(),
      task: metadata.task,
      dimensions: metadata.dimensions,
      quantization: metadata.quantization,
      sourceModel: metadata.source,
    };
  }

  private getModelDisplayName(
    modelId: string,
    metadata: AtlasEmbeddingModelMetadata,
  ): string {
    if (metadata.name) {
      return metadata.name;
    }

    if (
      modelId === DEFAULT_EMBEDDING_MODEL_ID ||
      metadata.source === DEFAULT_EMBEDDING_MODEL_METADATA.source
    ) {
      return DEFAULT_EMBEDDING_MODEL_METADATA.name;
    }

    return modelId;
  }

  private isEmbeddingModelDirectory(modelPath: string): boolean {
    if (!this.isDirectory(modelPath)) {
      return false;
    }

    const hasConfig = this.isFile(path.join(modelPath, "config.json"));
    const hasTokenizer =
      this.isFile(path.join(modelPath, "tokenizer.json")) ||
      this.isFile(path.join(modelPath, "tokenizer_config.json"));
    const onnxPath = path.join(modelPath, "onnx");
    const hasOnnx =
      this.isDirectory(onnxPath) &&
      fs
        .readdirSync(onnxPath)
        .some(
          (fileName) =>
            fileName.toLowerCase().endsWith(".onnx") &&
            this.hasRequiredOnnxExternalData(path.join(onnxPath, fileName)),
        );

    return hasConfig && hasTokenizer && hasOnnx;
  }

  private hasRequiredOnnxExternalData(onnxFilePath: string): boolean {
    try {
      const stat = fs.statSync(onnxFilePath);

      if (!stat.isFile()) {
        return false;
      }

      if (stat.size > 10 * 1024 * 1024) {
        return true;
      }

      const content = fs.readFileSync(onnxFilePath).toString("utf8");
      const externalDataFiles = Array.from(
        new Set(content.match(/[A-Za-z0-9_.-]+\.onnx_data/g) ?? []),
      );

      return externalDataFiles.every((fileName) =>
        this.isFile(path.join(path.dirname(onnxFilePath), fileName)),
      );
    } catch {
      return false;
    }
  }

  private readModelMetadata(modelPath: string): AtlasEmbeddingModelMetadata {
    const metadataPath = path.join(modelPath, "atlas-model.json");

    if (!this.isFile(metadataPath)) {
      return {};
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

      if (typeof parsed !== "object" || parsed === null) {
        return {};
      }

      const data = parsed as Record<string, unknown>;

      return {
        name: typeof data.name === "string" ? data.name : undefined,
        source: typeof data.source === "string" ? data.source : undefined,
        task: typeof data.task === "string" ? data.task : undefined,
        dimensions:
          typeof data.dimensions === "number" ? data.dimensions : undefined,
        quantization:
          typeof data.quantization === "string"
            ? data.quantization
            : undefined,
      };
    } catch {
      return {};
    }
  }

  private getConfiguredModelsDir(): string {
    const configured = this.configManager.getConfig().rag.embeddingModelsDir;
    return typeof configured === "string" ? configured.trim() : "";
  }

  private ensureDirectory(directoryPath: string): void {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error("Download do modelo de embeddings cancelado.");
    }
  }

  private isDirectory(candidatePath: string): boolean {
    try {
      return fs.statSync(candidatePath).isDirectory();
    } catch {
      return false;
    }
  }

  private isFile(candidatePath: string): boolean {
    try {
      return fs.statSync(candidatePath).isFile();
    } catch {
      return false;
    }
  }

  private getDirectorySize(directoryPath: string): number {
    let total = 0;

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        total += this.getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        total += fs.statSync(entryPath).size;
      }
    }

    return total;
  }

  private formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }
}
