import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import {
  HuggingFaceGgufFile,
  HuggingFaceModelDetails,
  HuggingFaceModelSummary,
  HuggingFaceOnnxFile,
} from "../interfaces/HuggingFaceModelTypes";

type HuggingFaceSibling = {
  rfilename?: string;
  size?: number;
};

type HuggingFaceModelRaw = {
  id?: string;
  modelId?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  gated?: boolean | string;
  private?: boolean;
  pipeline_tag?: string;
  description?: string;
  lastModified?: string;
  tags?: string[];
  cardData?: {
    description?: string;
    language?: string | string[];
    license?: string;
    pretty_name?: string;
    summary?: string;
  };
  siblings?: HuggingFaceSibling[];
};

const GENERATION_PIPELINE_TAGS = new Set(["any-to-any", "text-generation"]);
const EMBEDDING_PIPELINE_TAGS = new Set([
  "feature-extraction",
  "sentence-similarity",
]);
const EMBEDDING_REQUIRED_FILES = [
  "config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.txt",
  "merges.txt",
  "sentencepiece.bpe.model",
  "spiece.model",
  "unigram.json",
];

export type HuggingFaceModelSearchFilter = "all" | "llm" | "embedding";

export class HuggingFaceModelService {
  private readonly baseUrl = "https://huggingface.co";

  constructor(
    private readonly getModelsDir: () => string,
    private readonly getApiToken?: () => Promise<string | undefined>,
    private readonly getEmbeddingModelsDir?: () => string,
  ) {}

  public async searchModels(
    query: string,
    modelFilter: HuggingFaceModelSearchFilter = "all",
  ): Promise<HuggingFaceModelSummary[]> {
    try {
      const headers = await this.buildHeaders();
      const normalizedQuery = query.trim();
      const commonParams = {
        sort: "downloads",
        direction: -1,
        limit: 100,
        full: true,
      };
      const requests: Promise<{ data: HuggingFaceModelRaw[] }>[] = [];

      if (modelFilter !== "embedding") {
        requests.push(
          axios.get<HuggingFaceModelRaw[]>(`${this.baseUrl}/api/models`, {
            headers,
            params: {
              ...commonParams,
              search: normalizedQuery || "gguf",
              filter: "gguf",
            },
            timeout: 30000,
          }),
        );
      }

      if (modelFilter !== "llm") {
        requests.push(
          axios.get<HuggingFaceModelRaw[]>(`${this.baseUrl}/api/models`, {
            headers,
            params: {
              ...commonParams,
              search: normalizedQuery || undefined,
              pipeline_tag: "feature-extraction",
            },
            timeout: 30000,
          }),
          axios.get<HuggingFaceModelRaw[]>(`${this.baseUrl}/api/models`, {
            headers,
            params: {
              ...commonParams,
              search: normalizedQuery || undefined,
              pipeline_tag: "sentence-similarity",
            },
            timeout: 30000,
          }),
        );
      }

      const responses = await Promise.all(requests);
      const modelsById = new Map<string, HuggingFaceModelRaw>();

      for (const model of responses.flatMap((response) => response.data)) {
        const id = model.id || model.modelId;

        if (id && !modelsById.has(id)) {
          modelsById.set(id, model);
        }
      }

      return Array.from(modelsById.values())
        .filter((model) => this.isSupportedModel(model))
        .map((model) => this.mapModel(model))
        .sort((left, right) => right.downloads - left.downloads)
        .slice(0, 25);
    } catch (error) {
      throw this.normalizeHuggingFaceError(
        error,
        "Nao foi possivel buscar modelos no Hugging Face.",
      );
    }
  }

  public async getModelDetails(
    modelId: string,
  ): Promise<HuggingFaceModelDetails> {
    try {
      const response = await axios.get<HuggingFaceModelRaw>(
        `${this.baseUrl}/api/models/${this.encodeRepoId(modelId)}`,
        {
          headers: await this.buildHeaders(),
          params: {
            blobs: true,
          },
          timeout: 30000,
        },
      );

      const summary = this.mapModel(response.data);

      return {
        ...summary,
        description:
          this.buildDescription(response.data) ||
          (await this.getReadmeSummary(modelId)) ||
          "Modelo compatível disponível no Hugging Face.",
      };
    } catch (error) {
      throw this.normalizeHuggingFaceError(
        error,
        "Nao foi possivel carregar detalhes do modelo no Hugging Face.",
      );
    }
  }

  public async downloadGguf(
    modelId: string,
    fileName: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!fileName.toLowerCase().endsWith(".gguf")) {
      throw new Error("Apenas arquivos .gguf podem ser baixados.");
    }

    if (!this.isRunnableGgufFile(fileName)) {
      throw new Error(
        "Este arquivo GGUF e um projetor multimodal (mmproj) ou auxiliar, nao um modelo local executavel.",
      );
    }

    const safeFileName = path.basename(fileName.replace(/\\/g, "/"));

    if (!safeFileName || safeFileName.includes("..")) {
      throw new Error("Nome de arquivo GGUF invalido.");
    }

    const modelsDir = this.getModelsDir();
    const targetPath = path.join(modelsDir, safeFileName);

    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.encodeRepoId(modelId)}/resolve/main/${this.encodeRepoPath(fileName)}`,
        {
          headers: await this.buildHeaders(),
          responseType: "stream",
          signal,
          timeout: 30000,
        },
      );

      const totalBytes = Number(response.headers["content-length"]) || 0;
      let downloadedBytes = 0;

      response.data.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;

        if (totalBytes > 0) {
          onProgress?.(Math.round((downloadedBytes / totalBytes) * 100));
        }
      });

      await pipeline(response.data, fs.createWriteStream(targetPath));
      return targetPath;
    } catch (error) {
      if (signal?.aborted || axios.isCancel(error)) {
        this.deletePartialDownload(targetPath);
        throw new Error("Download cancelado.");
      }

      throw this.normalizeHuggingFaceError(
        error,
        "Nao foi possivel baixar o modelo do Hugging Face.",
      );
    }
  }

  public async downloadModel(
    model: HuggingFaceModelDetails,
    fileName: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (model.format === "ONNX") {
      return this.downloadEmbeddingModel(model, fileName, onProgress, signal);
    }

    return this.downloadGguf(model.id, fileName, onProgress, signal);
  }

  public async downloadEmbeddingModel(
    model: HuggingFaceModelDetails,
    fileName: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.isRunnableOnnxFile(fileName)) {
      throw new Error("Apenas arquivos ONNX de embeddings podem ser baixados.");
    }

    if (!this.getEmbeddingModelsDir) {
      throw new Error("Pasta de modelos de embeddings nao configurada.");
    }

    const files = this.getEmbeddingDownloadFiles(model, fileName);
    const modelDir = path.join(
      this.getEmbeddingModelsDir(),
      this.getSafeModelDirectoryName(model.id),
    );

    try {
      for (let index = 0; index < files.length; index += 1) {
        this.throwIfAborted(signal);
        const relativePath = files[index];
        const targetPath = path.join(modelDir, relativePath);

        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await this.downloadFile(model.id, relativePath, targetPath, signal);
        onProgress?.(Math.round(((index + 1) / files.length) * 100));
      }

      await fs.promises.writeFile(
        path.join(modelDir, "atlas-model.json"),
        JSON.stringify(
          {
            name: model.name || model.id,
            source: model.id,
            revision: "main",
            task: model.pipelineTag || "feature-extraction",
            quantization: fileName.toLowerCase().includes("quantized")
              ? "int8"
              : "fp32",
          },
          null,
          2,
        ),
        "utf8",
      );

      return modelDir;
    } catch (error) {
      if (signal?.aborted || axios.isCancel(error)) {
        this.deletePartialDownload(modelDir);
        throw new Error("Download cancelado.");
      }

      throw this.normalizeHuggingFaceError(
        error,
        "Nao foi possivel baixar o modelo de embeddings do Hugging Face.",
      );
    }
  }

  private normalizeHuggingFaceError(error: unknown, fallback: string): Error {
    if (axios.isAxiosError(error)) {
      const code = error.code ?? "";
      const status = error.response?.status;

      if (
        code === "ENOTFOUND" ||
        code === "EAI_AGAIN" ||
        code === "ECONNREFUSED" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "ERR_NETWORK"
      ) {
        return new Error(
          "Não foi possivel conectar ao Hugging Face. Verifique sua conexão com a internet e tente novamente.",
        );
      }

      if (code === "ECONNABORTED") {
        return new Error(
          "A conexão com o Hugging Face demorou demais. Tente novamente em alguns instantes.",
        );
      }

      if (status === 401 || status === 403) {
        return new Error(
          "O Hugging Face recusou a requisição. Verifique sua chave de API ou tente sem modelos privados.",
        );
      }

      if (status === 404) {
        return new Error("Modelo ou arquivo não encontrado no Hugging Face.");
      }

      if (status === 429) {
        return new Error(
          "O Hugging Face limitou temporariamente as requisições. Aguarde um pouco e tente novamente.",
        );
      }

      if (status && status >= 500) {
        return new Error(
          "O Hugging Face está indisponivel no momento. Tente novamente em alguns instantes.",
        );
      }
    }

    return error instanceof Error ? error : new Error(fallback);
  }

  private deletePartialDownload(targetPath: string): void {
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true, recursive: true });
      }
    } catch (error) {
      console.warn(
        `[ATLAS HuggingFace] Nao foi possivel remover download parcial: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private mapModel(model: HuggingFaceModelRaw): HuggingFaceModelSummary {
    const id = model.id || model.modelId || "";
    const name = id.split("/").pop() || id;
    const format = this.isEmbeddingModel(model) ? "ONNX" : "GGUF";

    return {
      id,
      name,
      author: model.author || id.split("/")[0] || "Hugging Face",
      downloads: model.downloads ?? 0,
      likes: model.likes ?? 0,
      gated: model.gated === true || typeof model.gated === "string",
      private: model.private === true,
      pipelineTag: model.pipeline_tag || null,
      updatedAt: model.lastModified ?? null,
      tags: model.tags ?? [],
      description: this.buildDescription(model),
      format,
      repositoryFiles: (model.siblings ?? [])
        .map((file) => file.rfilename ?? "")
        .filter(Boolean),
      ggufFiles: (model.siblings ?? [])
        .filter((file) => this.isRunnableGgufFile(file.rfilename ?? ""))
        .map((file) => this.mapGgufFile(id, file))
        .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)),
      onnxFiles: (model.siblings ?? [])
        .filter((file) => this.isRunnableOnnxFile(file.rfilename ?? ""))
        .map((file) => this.mapOnnxFile(id, file))
        .sort(
          (a, b) =>
            Number(b.name.includes("quantized")) -
            Number(a.name.includes("quantized")),
        ),
    };
  }

  private mapGgufFile(
    modelId: string,
    file: HuggingFaceSibling,
  ): HuggingFaceGgufFile {
    const name = file.rfilename ?? "";

    return {
      name,
      sizeBytes: file.size ?? null,
      size: this.formatBytes(file.size ?? 0),
      quantization: this.inferQuantization(name),
      downloadUrl: `${this.baseUrl}/${this.encodeRepoId(modelId)}/resolve/main/${this.encodeRepoPath(name)}`,
      fileUrl: `${this.baseUrl}/${this.encodeRepoId(modelId)}/blob/main/${this.encodeRepoPath(name)}`,
    };
  }

  private mapOnnxFile(
    modelId: string,
    file: HuggingFaceSibling,
  ): HuggingFaceOnnxFile {
    const name = file.rfilename ?? "";

    return {
      name,
      sizeBytes: file.size ?? null,
      size: this.formatBytes(file.size ?? 0),
      quantization: name.toLowerCase().includes("quantized") ? "Q8" : "FP32",
      downloadUrl: `${this.baseUrl}/${this.encodeRepoId(modelId)}/resolve/main/${this.encodeRepoPath(name)}`,
      fileUrl: `${this.baseUrl}/${this.encodeRepoId(modelId)}/blob/main/${this.encodeRepoPath(name)}`,
    };
  }

  private getEmbeddingDownloadFiles(
    model: HuggingFaceModelDetails,
    selectedOnnxFile: string,
  ): string[] {
    const repositoryFiles = new Map(
      model.repositoryFiles.map((file) => [file.toLowerCase(), file]),
    );
    const files = EMBEDDING_REQUIRED_FILES.map((file) =>
      repositoryFiles.get(file.toLowerCase()),
    ).filter((file): file is string => Boolean(file));

    files.push(selectedOnnxFile);
    return Array.from(new Set(files));
  }

  private async downloadFile(
    modelId: string,
    relativePath: string,
    targetPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await axios.get(
      `${this.baseUrl}/${this.encodeRepoId(modelId)}/resolve/main/${this.encodeRepoPath(relativePath)}`,
      {
        headers: await this.buildHeaders(),
        responseType: "stream",
        signal,
        timeout: 30000,
      },
    );

    await pipeline(response.data, fs.createWriteStream(targetPath));
  }

  private getSafeModelDirectoryName(modelId: string): string {
    const name = modelId
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop();

    return (name || modelId)
      .replace(/[^a-z0-9._-]+/gi, "-")
      .slice(0, 120);
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error("Download cancelado.");
    }
  }

  private buildDescription(model: HuggingFaceModelRaw): string {
    const candidates = [
      model.description,
      model.cardData?.description,
      model.cardData?.summary,
      model.cardData?.pretty_name,
    ];

    return this.normalizeSummary(candidates.find(Boolean) ?? "");
  }

  private async getReadmeSummary(modelId: string): Promise<string> {
    try {
      const response = await axios.get<string>(
        `${this.baseUrl}/${this.encodeRepoId(modelId)}/raw/main/README.md`,
        {
          headers: await this.buildHeaders(),
          responseType: "text",
          timeout: 15000,
        },
      );

      return this.normalizeSummary(response.data);
    } catch {
      return "";
    }
  }

  private normalizeSummary(value: string): string {
    return String(value ?? "")
      .replace(/^---[\s\S]*?---/m, " ")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/[*_`>#|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 360);
  }
  private inferQuantization(fileName: string): string {
    const match = fileName.match(
      /(?:^|[-_.])((?:IQ|Q)\d(?:_\d)?(?:_[A-Z]+){0,3})(?:[-_.]|$)/i,
    );

    return match?.[1]?.toUpperCase() ?? "GGUF";
  }

  private isRunnableGgufFile(fileName: string): boolean {
    const normalized = path.basename(fileName).toLowerCase();

    return (
      normalized.endsWith(".gguf") &&
      !normalized.startsWith("mmproj") &&
      !normalized.includes("mmproj-") &&
      !normalized.includes("projector")
    );
  }

  private isSupportedModel(model: HuggingFaceModelRaw): boolean {
    if (this.isEmbeddingModel(model)) {
      return this.hasCompatibleEmbeddingFiles(model);
    }

    return (
      this.getDeclaredTasks(model).some((task) =>
        GENERATION_PIPELINE_TAGS.has(task),
      ) &&
      (model.siblings ?? []).some((file) =>
        this.isRunnableGgufFile(file.rfilename ?? ""),
      )
    );
  }

  private isEmbeddingModel(model: HuggingFaceModelRaw): boolean {
    const declaredTasks = this.getDeclaredTasks(model);

    return (
      declaredTasks.some((task) => EMBEDDING_PIPELINE_TAGS.has(task)) ||
      (!model.pipeline_tag && this.hasEmbeddingIdentity(model))
    );
  }

  private getDeclaredTasks(model: HuggingFaceModelRaw): string[] {
    return [model.pipeline_tag, ...(model.tags ?? [])]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase());
  }

  private hasEmbeddingIdentity(model: HuggingFaceModelRaw): boolean {
    const identity = [model.id, model.modelId, ...(model.tags ?? [])]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();

    return /(?:^|[\s/_:.-])(embed(?:ding|dings)?|sentence-transformers?)/.test(
      identity,
    );
  }

  private hasCompatibleEmbeddingFiles(model: HuggingFaceModelRaw): boolean {
    const fileNames = new Set(
      (model.siblings ?? []).map((file) =>
        (file.rfilename ?? "").toLowerCase(),
      ),
    );
    const hasTokenizer =
      fileNames.has("tokenizer.json") || fileNames.has("tokenizer_config.json");

    return (
      fileNames.has("config.json") &&
      hasTokenizer &&
      Array.from(fileNames).some((fileName) =>
        this.isRunnableOnnxFile(fileName),
      )
    );
  }

  private isRunnableOnnxFile(fileName: string): boolean {
    const normalized = fileName.replace(/\\/g, "/").toLowerCase();

    return (
      normalized === "onnx/model.onnx" ||
      normalized === "onnx/model_quantized.onnx"
    );
  }

  private formatBytes(bytes: number): string {
    if (!bytes) {
      return "Tamanho não informado";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 1 : 2)} ${units[unitIndex]}`;
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const token =
      (await this.getApiToken?.()) ||
      process.env.ATLAS_HUGGINGFACE_API_KEY ||
      process.env.HUGGINGFACE_API_KEY ||
      process.env.HF_TOKEN;

    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private encodeRepoId(modelId: string): string {
    return modelId.split("/").map(encodeURIComponent).join("/");
  }

  private encodeRepoPath(filePath: string): string {
    return filePath.split("/").map(encodeURIComponent).join("/");
  }
}
