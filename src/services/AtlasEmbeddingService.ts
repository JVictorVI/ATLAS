import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasEmbeddingModelDiscoveryService } from "./AtlasEmbeddingModelDiscoveryService";

type FeatureExtractionOutput = {
  tolist(): unknown;
  dispose(): void;
};

type FeatureExtractionPipeline = ((
  texts: string[],
  options: {
    pooling: "mean";
    normalize: boolean;
  },
) => Promise<FeatureExtractionOutput>) & { dispose(): Promise<void> };

type EmbeddingDtype = "q8" | "fp32";

export class AtlasEmbeddingService {
  public static readonly batchSize = 8;
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
  private pipelineModelPath: string | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
    private readonly modelDiscoveryService: AtlasEmbeddingModelDiscoveryService,
  ) {}

  public async embedDocuments(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    return this.runExclusive(async () => {
      this.throwIfAborted(signal);
      const extractor = await this.getPipeline();
      const embeddings: number[][] = [];

      for (let offset = 0; offset < texts.length; offset += AtlasEmbeddingService.batchSize) {
        this.throwIfAborted(signal);
        const batch = texts.slice(offset, offset + AtlasEmbeddingService.batchSize);
        const output = await extractor(batch, {
          pooling: "mean",
          normalize: true,
        });

        try {
          this.throwIfAborted(signal);
          embeddings.push(...this.normalizeOutput(output.tolist(), batch.length));
        } finally {
          output.dispose();
        }
      }

      return embeddings;
    });
  }

  public async dispose(): Promise<void> {
    await this.runExclusive(() => this.releasePipeline());
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async releasePipeline(): Promise<void> {
    const pending = this.pipelinePromise;
    this.pipelinePromise = null;
    this.pipelineModelPath = null;

    const pipeline = await pending?.catch(() => null);
    if (pipeline) {
      await pipeline.dispose().catch((error) => {
        console.warn("[ATLAS RAG] Falha ao liberar o modelo de embeddings:", error);
      });
    }
  }

  public async embedQuery(
    text: string,
    signal?: AbortSignal,
  ): Promise<number[]> {
    const embeddings = await this.embedDocuments([text], signal);
    const embedding = embeddings[0];

    if (!embedding) {
      throw new Error("O modelo de embeddings não retornou um vetor.");
    }

    return embedding;
  }

  public getModelId(): string {
    return this.configManager.getConfig().rag.embeddingModel;
  }

  public getModelPath(): string {
    return this.modelDiscoveryService.resolveActiveModelPath().path;
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    const modelPath = this.getModelPath();

    if (this.pipelineModelPath !== modelPath) {
      await this.releasePipeline();
    }

    if (!this.pipelinePromise) {
      this.pipelineModelPath = modelPath;
      this.pipelinePromise = this.loadPipeline();
    }

    try {
      return await this.pipelinePromise;
    } catch (error) {
      this.pipelinePromise = null;
      this.pipelineModelPath = null;
      throw error;
    }
  }

  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    const model = this.modelDiscoveryService.resolveActiveModelPath();
    const modelPath = model.path;

    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Modelo local de embeddings não encontrado: ${modelPath}`,
      );
    }

    const dtype = this.resolveEmbeddingDtype(modelPath);

    this.configureBundledRuntimePath();
    const transformers = await import("@huggingface/transformers");
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.localModelPath = path.dirname(modelPath);

    const previousCache = transformers.env.customCache;
    const previousUseCustomCache = transformers.env.useCustomCache;
    const previousUseFSCache = transformers.env.useFSCache;
    transformers.env.useCustomCache = true;
    transformers.env.useFSCache = false;
    transformers.env.customCache = {
      match: (request: string) => this.readLocalModelFile(modelPath, request),
      put: async () => {},
    };

    try {
      const extractor = await transformers.pipeline(
        "feature-extraction",
        modelPath.replace(/\\/g, "/"),
        { local_files_only: true, dtype },
      );
      return extractor as unknown as FeatureExtractionPipeline;
    } finally {
      transformers.env.customCache = previousCache;
      transformers.env.useCustomCache = previousUseCustomCache;
      transformers.env.useFSCache = previousUseFSCache;
    }
  }

  private async readLocalModelFile(
    modelPath: string,
    request: string,
  ): Promise<Response | undefined> {
    if (typeof request !== "string" || !path.isAbsolute(request)) {
      return undefined;
    }
    const relativePath = path.relative(modelPath, request);
    if (relativePath.startsWith(`..${path.sep}`) || relativePath === ".." || path.isAbsolute(relativePath)) {
      return undefined;
    }
    const stat = await fs.promises.stat(request).catch(() => null);
    if (!stat?.isFile()) {
      return undefined;
    }
    return new Response(
      Readable.toWeb(fs.createReadStream(request)) as ReadableStream<Uint8Array>,
      { headers: { "Content-Length": String(stat.size) } },
    );
  }

  private resolveEmbeddingDtype(modelPath: string): EmbeddingDtype {
    const onnxPath = path.join(modelPath, "onnx");

    if (fs.existsSync(path.join(onnxPath, "model_quantized.onnx"))) {
      return "q8";
    }

    if (fs.existsSync(path.join(onnxPath, "model.onnx"))) {
      return "fp32";
    }

    throw new Error(
      `Modelo de embeddings sem arquivo ONNX compatível: ${onnxPath}. ` +
        "Esperado model_quantized.onnx ou model.onnx.",
    );
  }

  private configureBundledRuntimePath(): void {
    const runtimeNodeModules = path.join(
      this.context.extensionPath,
      "resources",
      "embedding-runtime",
      "node_modules",
    );

    if (!fs.existsSync(runtimeNodeModules)) {
      return;
    }

    const currentPaths = (process.env.NODE_PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean);

    if (!currentPaths.includes(runtimeNodeModules)) {
      process.env.NODE_PATH = [runtimeNodeModules, ...currentPaths].join(
        path.delimiter,
      );
      const nodeModule = require("module") as {
        Module: { _initPaths(): void };
      };
      nodeModule.Module._initPaths();
    }
  }

  private normalizeOutput(value: unknown, expectedCount: number): number[][] {
    if (!Array.isArray(value)) {
      throw new Error("Formato inválido retornado pelo modelo de embeddings.");
    }

    const vectors =
      expectedCount === 1 && value.every((item) => typeof item === "number")
        ? [value]
        : value;

    if (
      vectors.length !== expectedCount ||
      !vectors.every(
        (vector) =>
          Array.isArray(vector) &&
          vector.length > 0 &&
          vector.every((item) => typeof item === "number"),
      )
    ) {
      throw new Error(
        "Quantidade ou formato dos vetores de embeddings é inválido.",
      );
    }

    return vectors as number[][];
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error("Geração de embeddings cancelada.");
      error.name = "AbortError";
      throw error;
    }
  }
}
