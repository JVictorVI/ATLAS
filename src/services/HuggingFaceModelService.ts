import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import {
  HuggingFaceGgufFile,
  HuggingFaceModelDetails,
  HuggingFaceModelSummary,
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
  lastModified?: string;
  tags?: string[];
  cardData?: {
    language?: string | string[];
    license?: string;
    pretty_name?: string;
  };
  siblings?: HuggingFaceSibling[];
};

export class HuggingFaceModelService {
  private readonly baseUrl = "https://huggingface.co";

  constructor(
    private readonly getModelsDir: () => string,
    private readonly getApiToken?: () => Promise<string | undefined>,
  ) {}

  public async searchModels(query: string): Promise<HuggingFaceModelSummary[]> {
    try {
      const response = await axios.get<HuggingFaceModelRaw[]>(
        `${this.baseUrl}/api/models`,
        {
          headers: await this.buildHeaders(),
          params: {
            search: query.trim() || "gguf",
            filter: "gguf",
            sort: "downloads",
            direction: -1,
            limit: 25,
            full: true,
          },
          timeout: 30000,
        },
      );

      return response.data
        .map((model) => this.mapModel(model))
        .filter((model) => model.ggufFiles.length > 0);
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
        description: this.buildDescription(response.data),
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
        fs.unlinkSync(targetPath);
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

    return {
      id,
      name,
      author: model.author || id.split("/")[0] || "Hugging Face",
      downloads: model.downloads ?? 0,
      likes: model.likes ?? 0,
      updatedAt: model.lastModified ?? null,
      tags: model.tags ?? [],
      ggufFiles: (model.siblings ?? [])
        .filter((file) => this.isRunnableGgufFile(file.rfilename ?? ""))
        .map((file) => this.mapGgufFile(id, file))
        .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)),
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

  private buildDescription(model: HuggingFaceModelRaw): string {
    const parts = [
      model.cardData?.pretty_name,
      model.cardData?.license ? `Licenças: ${model.cardData.license}` : "",
      model.tags?.length ? `Tags: ${model.tags.slice(0, 8).join(", ")}` : "",
    ].filter(Boolean);

    return parts.join("\n") || "Modelo GGUF disponivel no Hugging Face.";
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

  private formatBytes(bytes: number): string {
    if (!bytes) {
      return "Tamanho nao informado";
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
