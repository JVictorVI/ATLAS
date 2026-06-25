import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";

type FeatureExtractionOutput = {
  tolist(): unknown;
};

type FeatureExtractionPipeline = (
  texts: string[],
  options: {
    pooling: "mean";
    normalize: boolean;
  },
) => Promise<FeatureExtractionOutput>;

export class AtlasEmbeddingService {
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public async embedDocuments(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    this.throwIfAborted(signal);
    const extractor = await this.getPipeline();
    this.throwIfAborted(signal);

    const output = await extractor(texts, {
      pooling: "mean",
      normalize: true,
    });

    this.throwIfAborted(signal);
    return this.normalizeOutput(output.tolist(), texts.length);
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
    return path.join(
      this.context.extensionPath,
      "resources",
      "embeddings",
      this.getModelId(),
    );
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadPipeline();
    }

    try {
      return await this.pipelinePromise;
    } catch (error) {
      this.pipelinePromise = null;
      throw error;
    }
  }

  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    const modelId = this.getModelId();
    const modelPath = this.getModelPath();

    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Modelo local de embeddings não encontrado: ${modelPath}`,
      );
    }

    this.configureBundledRuntimePath();
    const transformers = await import("@huggingface/transformers");
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.localModelPath = path.join(
      this.context.extensionPath,
      "resources",
      "embeddings",
    );

    const extractor = await transformers.pipeline(
      "feature-extraction",
      modelId,
      {
        local_files_only: true,
        dtype: "q8",
      },
    );

    return extractor as unknown as FeatureExtractionPipeline;
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
