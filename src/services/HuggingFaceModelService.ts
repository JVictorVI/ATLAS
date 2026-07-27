import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { Transform } from "stream";
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
  safetensors?: {
    parameters?: Record<string, number>;
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

export type HuggingFaceDownloadProgress = {
  percent: number;
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  fileDownloadedBytes: number;
  fileTotalBytes: number;
};

type FileDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number;
};

export type HuggingFaceModelSearchFilter = "all" | "llm" | "embedding";

export interface HuggingFaceModelSearchResult {
  models: HuggingFaceModelSummary[];
  offset: number;
  limit: number;
  hasNextPage: boolean;
}

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
    offset = 0,
    limit = 25,
  ): Promise<HuggingFaceModelSearchResult> {
    try {
      const headers = await this.buildHeaders();
      const normalizedQuery = query.trim();
      const safeOffset = Math.max(0, Math.floor(offset));
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50);
      const requestLimit = Math.min(
        Math.max(safeOffset + safeLimit + 1, 100),
        500,
      );
      const commonParams = {
        sort: "downloads",
        direction: -1,
        limit: requestLimit,
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

      const matchedModels = Array.from(modelsById.values())
        .filter((model) => this.isSupportedModel(model))
        .map((model) => this.mapModel(model))
        .sort((left, right) => right.downloads - left.downloads);

      return {
        models: matchedModels.slice(safeOffset, safeOffset + safeLimit),
        offset: safeOffset,
        limit: safeLimit,
        hasNextPage: matchedModels.length > safeOffset + safeLimit,
      };
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
    onProgress?: (progress: HuggingFaceDownloadProgress) => void,
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
    const partialPath = `${targetPath}.part`;

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
      const progressStream = this.createProgressTransform((chunkBytes) => {
        downloadedBytes += chunkBytes;

        if (totalBytes <= 0) {
          return;
        }

        onProgress?.({
          percent: Math.round((downloadedBytes / totalBytes) * 100),
          fileName,
          fileIndex: 1,
          totalFiles: 1,
          downloadedBytes,
          totalBytes,
          fileDownloadedBytes: downloadedBytes,
          fileTotalBytes: totalBytes,
        });
      });

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await this.removePath(partialPath);
      await pipeline(
        response.data,
        progressStream,
        fs.createWriteStream(partialPath),
      );
      this.validateDownloadedSize(partialPath, totalBytes);
      await this.replaceFile(partialPath, targetPath);
      return targetPath;
    } catch (error) {
      this.deletePartialDownload(partialPath);

      if (signal?.aborted || axios.isCancel(error)) {
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
    onProgress?: (progress: HuggingFaceDownloadProgress) => void,
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
    onProgress?: (progress: HuggingFaceDownloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.isRunnableOnnxFile(fileName)) {
      throw new Error("Apenas arquivos ONNX de embeddings podem ser baixados.");
    }

    if (!this.getEmbeddingModelsDir) {
      throw new Error("Pasta de modelos de embeddings nao configurada.");
    }

    const files = this.getEmbeddingDownloadFiles(model, fileName);
    const fileSizes = new Map(
      files.map((file) => [file, this.getRepositoryFileSize(model, file) ?? 0]),
    );
    const totalBytes = Array.from(fileSizes.values()).reduce(
      (sum, size) => sum + size,
      0,
    );
    let downloadedBytes = 0;
    const modelDir = path.join(
      this.getEmbeddingModelsDir(),
      this.getSafeModelDirectoryName(model.id),
    );
    const stagingDir = `${modelDir}.download`;

    try {
      await this.removePath(stagingDir);

      for (let index = 0; index < files.length; index += 1) {
        this.throwIfAborted(signal);
        const relativePath = files[index];
        const targetPath = this.resolveSafeDownloadTarget(
          stagingDir,
          relativePath,
        );
        const expectedSize = this.getRepositoryFileSize(model, relativePath);
        const completedBytesBeforeFile = downloadedBytes;

        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        const actualSize = await this.downloadFile(
          model.id,
          relativePath,
          targetPath,
          signal,
          expectedSize,
          (fileProgress) => {
            const aggregateDownloadedBytes =
              completedBytesBeforeFile + fileProgress.downloadedBytes;
            const fileRatio =
              fileProgress.totalBytes > 0
                ? fileProgress.downloadedBytes / fileProgress.totalBytes
                : 0;
            const percent =
              totalBytes > 0
                ? Math.min(
                    99,
                    Math.round((aggregateDownloadedBytes / totalBytes) * 100),
                  )
                : Math.min(99, Math.round(((index + fileRatio) / files.length) * 100));

            onProgress?.({
              percent,
              fileName: relativePath,
              fileIndex: index + 1,
              totalFiles: files.length,
              downloadedBytes: aggregateDownloadedBytes,
              totalBytes,
              fileDownloadedBytes: fileProgress.downloadedBytes,
              fileTotalBytes: fileProgress.totalBytes,
            });
          },
        );
        downloadedBytes +=
          expectedSize || fileSizes.get(relativePath) || actualSize;

        onProgress?.({
          percent:
            index === files.length - 1
              ? 100
              : totalBytes > 0
                ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
                : Math.round(((index + 1) / files.length) * 100),
          fileName: relativePath,
          fileIndex: index + 1,
          totalFiles: files.length,
          downloadedBytes,
          totalBytes,
          fileDownloadedBytes: actualSize,
          fileTotalBytes: expectedSize || actualSize,
        });
      }

      await fs.promises.writeFile(
        path.join(stagingDir, "atlas-model.json"),
        JSON.stringify(
          {
            name: model.name || model.id,
            source: model.id,
            revision: "main",
            task: model.pipelineTag || "feature-extraction",
            quantization: fileName.toLowerCase().includes("quantized")
              ? "int8"
              : "fp32",
            files: files.map((name) => ({
              name,
              sizeBytes: this.getRepositoryFileSize(model, name),
            })),
          },
          null,
          2,
        ),
        "utf8",
      );

      await this.removePath(modelDir);
      await fs.promises.rename(stagingDir, modelDir);
      return modelDir;
    } catch (error) {
      this.deletePartialDownload(stagingDir);

      if (signal?.aborted || axios.isCancel(error)) {
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
      parameterCount: this.getParameterCount(model),
      repositoryFiles: (model.siblings ?? [])
        .map((file) => file.rfilename ?? "")
        .filter(Boolean),
      repositoryFileDetails: (model.siblings ?? [])
        .map((file) => ({
          name: file.rfilename ?? "",
          sizeBytes:
            typeof file.size === "number" && Number.isFinite(file.size)
              ? file.size
              : null,
        }))
        .filter((file) => Boolean(file.name)),
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
      model.repositoryFiles.map((file) => [
        this.normalizeRepoPath(file).toLowerCase(),
        this.normalizeRepoPath(file),
      ]),
    );
    const normalizedSelectedOnnx = this.normalizeRepoPath(selectedOnnxFile);
    const selectedOnnxFileName = repositoryFiles.get(
      normalizedSelectedOnnx.toLowerCase(),
    );

    if (!selectedOnnxFileName) {
      throw new Error("Arquivo ONNX selecionado nao existe no repositorio.");
    }

    const selectedOnnxDir = path.posix.dirname(selectedOnnxFileName);
    const isNestedOnnx = selectedOnnxDir !== ".";
    const files = EMBEDDING_REQUIRED_FILES.map((file) =>
      repositoryFiles.get(file.toLowerCase()),
    ).filter((file): file is string => Boolean(file));

    if (isNestedOnnx) {
      for (const file of EMBEDDING_REQUIRED_FILES) {
        const nestedFile = repositoryFiles.get(
          `${selectedOnnxDir}/${file}`.toLowerCase(),
        );

        if (nestedFile) {
          files.push(nestedFile);
        }
      }
    }

    files.push(selectedOnnxFileName);

    for (const file of repositoryFiles.values()) {
      if (!this.isEmbeddingOnnxCompanionFile(file, selectedOnnxFileName)) {
        continue;
      }

      files.push(file);
    }

    return Array.from(new Set(files));
  }

  private async downloadFile(
    modelId: string,
    relativePath: string,
    targetPath: string,
    signal?: AbortSignal,
    expectedSize?: number | null,
    onProgress?: (progress: FileDownloadProgress) => void,
  ): Promise<number> {
    const partialPath = `${targetPath}.part`;
    const response = await axios.get(
      `${this.baseUrl}/${this.encodeRepoId(modelId)}/resolve/main/${this.encodeRepoPath(relativePath)}`,
      {
        headers: await this.buildHeaders(),
        responseType: "stream",
        signal,
        timeout: 30000,
      },
    );
    const responseSize = Number(response.headers["content-length"]) || 0;
    const sizeToValidate = expectedSize || responseSize;
    let downloadedBytes = 0;
    const progressStream = this.createProgressTransform((chunkBytes) => {
      downloadedBytes += chunkBytes;
      onProgress?.({
        downloadedBytes,
        totalBytes: sizeToValidate,
      });
    });

    try {
      await this.removePath(partialPath);
      await pipeline(
        response.data,
        progressStream,
        fs.createWriteStream(partialPath),
      );
      this.validateDownloadedSize(partialPath, sizeToValidate);
      await this.replaceFile(partialPath, targetPath);
      return downloadedBytes || fs.statSync(targetPath).size;
    } catch (error) {
      this.deletePartialDownload(partialPath);
      throw error;
    }
  }

  private createProgressTransform(onChunk: (chunkBytes: number) => void): Transform {
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        onChunk(chunk.length);
        callback(null, chunk);
      },
    });
  }

  private isEmbeddingOnnxCompanionFile(
    candidatePath: string,
    selectedOnnxFile: string,
  ): boolean {
    const normalizedCandidate = this.normalizeRepoPath(candidatePath);
    const normalizedSelected = this.normalizeRepoPath(selectedOnnxFile);
    const selectedDir = path.posix.dirname(normalizedSelected);

    if (selectedDir === ".") {
      return false;
    }

    if (path.posix.dirname(normalizedCandidate) !== selectedDir) {
      return false;
    }

    const candidateName = path.posix.basename(normalizedCandidate);
    const selectedName = path.posix.basename(normalizedSelected);
    const lowerCandidateName = candidateName.toLowerCase();
    const lowerSelectedName = selectedName.toLowerCase();

    if (lowerCandidateName.endsWith(".onnx")) {
      return false;
    }

    return (
      lowerCandidateName.startsWith(`${lowerSelectedName}_`) ||
      lowerCandidateName.startsWith(`${lowerSelectedName}.`) ||
      (lowerSelectedName === "model.onnx" && !/\.(md|txt)$/i.test(candidateName))
    );
  }

  private getRepositoryFileSize(
    model: HuggingFaceModelDetails,
    relativePath: string,
  ): number | null {
    const normalizedPath = this.normalizeRepoPath(relativePath).toLowerCase();
    const file = model.repositoryFileDetails.find(
      (item) => this.normalizeRepoPath(item.name).toLowerCase() === normalizedPath,
    );

    return file?.sizeBytes ?? null;
  }

  private resolveSafeDownloadTarget(
    rootDir: string,
    relativePath: string,
  ): string {
    const normalizedPath = this.normalizeRepoPath(relativePath);

    if (
      !normalizedPath ||
      normalizedPath.startsWith("../") ||
      normalizedPath.includes("/../") ||
      path.posix.isAbsolute(normalizedPath)
    ) {
      throw new Error("Caminho de arquivo invalido no repositorio Hugging Face.");
    }

    const resolvedRoot = path.resolve(rootDir);
    const resolvedTarget = path.resolve(rootDir, ...normalizedPath.split("/"));
    const relative = path.relative(resolvedRoot, resolvedTarget);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Caminho de arquivo invalido no repositorio Hugging Face.");
    }

    return resolvedTarget;
  }

  private validateDownloadedSize(targetPath: string, expectedSize: number): void {
    if (expectedSize <= 0) {
      return;
    }

    const actualSize = fs.statSync(targetPath).size;

    if (actualSize !== expectedSize) {
      throw new Error(
        `Download incompleto para ${path.basename(targetPath)}: esperado ${this.formatDownloadedBytes(
          expectedSize,
        )}, recebido ${this.formatDownloadedBytes(actualSize)}.`,
      );
    }
  }

  private async replaceFile(sourcePath: string, targetPath: string): Promise<void> {
    await this.removePath(targetPath);
    await fs.promises.rename(sourcePath, targetPath);
  }

  private async removePath(targetPath: string): Promise<void> {
    await fs.promises.rm(targetPath, {
      force: true,
      recursive: true,
    });
  }

  private normalizeRepoPath(filePath: string): string {
    return filePath
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part.length > 0)
      .join("/");
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

  private getParameterCount(model: HuggingFaceModelRaw): number | null {
    const parameters = model.safetensors?.parameters;

    if (!parameters || typeof parameters !== "object") {
      return null;
    }

    const total = Object.values(parameters)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((sum, value) => sum + value, 0);

    return total > 0 ? total : null;
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
      .replace(/\r\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }
  private inferQuantization(fileName: string): string {
    const match = fileName.match(
      /(?:^|[-_.])((?:IQ|Q)[1-9](?:_\d)?(?:_[A-Z0-9]+){0,4})(?:[-_.]|$)/i,
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

  private formatDownloadedBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }

    return this.formatBytes(bytes);
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
