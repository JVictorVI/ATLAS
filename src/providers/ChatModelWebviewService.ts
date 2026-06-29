import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";

import { AtlasLocalModelDiscoveryService } from "../services/AtlasLocalModelDiscoveryService";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";

type GpuMemoryInfo = {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  label: string;
  totalLabel: string;
  usedLabel: string;
  freeLabel: string;
};

type LayerCountCacheEntry = {
  size: number;
  mtimeMs: number;
  value: number | null;
};

export class ChatModelWebviewService {
  private readonly layerCountCache = new Map<string, LayerCountCacheEntry>();
  private gpuMemoryCache: {
    expiresAt: number;
    value: GpuMemoryInfo | null;
  } | null = null;

  constructor(
    private readonly localModelDiscoveryService: AtlasLocalModelDiscoveryService,
    private readonly configManager: AtlasConfigManager,
    private readonly isLocalEngineRunning: () => boolean,
  ) {}

  public sendModelsToWebview(webview: vscode.Webview): void {
    const localModels = this.localModelDiscoveryService.refreshLocalModels();
    const totalSizeBytes = localModels.reduce(
      (sum, model) =>
        sum + (model.path ? this.getFileSizeBytes(model.path) : 0),
      0,
    );

    this.postModelsToWebview(webview, {
      localModels,
      totalSizeBytes,
      gpuMemory: null,
      includeLayerInfo: false,
    });

    setTimeout(() => {
      this.postModelsToWebview(webview, {
        localModels,
        totalSizeBytes,
        gpuMemory: this.getCachedGpuMemoryInfo(),
        includeLayerInfo: true,
      });
    }, 250);
  }

  private postModelsToWebview(
    webview: vscode.Webview,
    options: {
      localModels: ReturnType<AtlasConfigManager["getLocalModels"]>;
      totalSizeBytes: number;
      gpuMemory: GpuMemoryInfo | null;
      includeLayerInfo: boolean;
    },
  ): void {
    const { localModels, totalSizeBytes, gpuMemory, includeLayerInfo } =
      options;
    const modelsList = localModels.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      provider: model.provider || "Local",
      tag: model.metadata?.tags?.[0] || "LLM",
      quant: model.metadata?.quantization || "-",
      date: model.metadata?.installedAt
        ? new Date(model.metadata.installedAt).toLocaleDateString("pt-BR")
        : "-",
      file: model.path ? path.basename(model.path) : "-",
      size: model.metadata?.size || "-",
      sizeBytes: model.path ? this.getFileSizeBytes(model.path) : 0,
      layerInfo: {
        totalLayers:
          includeLayerInfo && model.path
            ? this.getCachedGgufLayerCount(model.path)
            : null,
      },
      hardware: {
        gpuMemory,
      },
      params: {
        gpu: model.parameters?.gpuLayers ?? 40,
        tokensRes: model.custom?.tokensRes ?? 2048,
        temp: model.parameters?.temperature ?? 0.7,
        topP: model.parameters?.topP ?? 0.95,
        context: model.parameters?.contextWindow ?? 8192,
        maxTokens: model.parameters?.maxTokens ?? 4096,
      },
      customPrompt: !!model.custom?.systemPrompt,
      systemPrompt: model.custom?.systemPrompt || "",
    }));

    void webview
      .postMessage({
        type: "updateModelsList",
        models: modelsList,
        health: {
          engineType: this.getConfiguredEngineType(),
          engineRunning: this.isLocalEngineRunning(),
          gpuMemory,
          modelsDir: this.localModelDiscoveryService.getModelsDir(),
          modelsCount: localModels.length,
          totalSizeBytes,
          totalSizeLabel: this.formatBytes(totalSizeBytes),
        },
      })
      .then(undefined, () => undefined);
  }

  private getFileSizeBytes(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  private getCachedGpuMemoryInfo(): GpuMemoryInfo | null {
    const now = Date.now();

    if (this.gpuMemoryCache && this.gpuMemoryCache.expiresAt > now) {
      return this.gpuMemoryCache.value;
    }

    const value = this.getGpuMemoryInfo();
    this.gpuMemoryCache = {
      value,
      expiresAt: now + 10000,
    };

    return value;
  }

  private getGpuMemoryInfo(): GpuMemoryInfo | null {
    if (process.platform !== "win32") {
      return null;
    }

    const nvidiaMemory = this.getNvidiaGpuMemoryInfo();
    if (nvidiaMemory) {
      return nvidiaMemory;
    }

    try {
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty AdapterRAM | ConvertTo-Json",
        ],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );
      const parsed = JSON.parse(output.trim());
      const values = Array.isArray(parsed) ? parsed : [parsed];
      const totalBytes = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .reduce((sum, value) => sum + value, 0);

      if (totalBytes <= 0) {
        return null;
      }

      return {
        totalBytes,
        label: this.formatBytes(totalBytes),
        totalLabel: this.formatBytes(totalBytes),
        usedBytes: 0,
        usedLabel: this.formatBytes(0),
        freeBytes: totalBytes,
        freeLabel: this.formatBytes(totalBytes),
      };
    } catch {
      return null;
    }
  }

  private getNvidiaGpuMemoryInfo(): GpuMemoryInfo | null {
    try {
      const output = execFileSync(
        "nvidia-smi.exe",
        [
          "--query-gpu=memory.total,memory.used",
          "--format=csv,noheader,nounits",
        ],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );
      const rows = output
        .trim()
        .split(/\r?\n/)
        .map((row) => row.split(",").map((value) => Number(value.trim())))
        .filter(
          ([total, used]) => Number.isFinite(total) && Number.isFinite(used),
        );

      if (rows.length === 0) {
        return null;
      }

      const totals = rows.reduce(
        (acc, [totalMb, usedMb]) => ({
          totalBytes: acc.totalBytes + totalMb * 1024 ** 2,
          usedBytes: acc.usedBytes + usedMb * 1024 ** 2,
        }),
        { totalBytes: 0, usedBytes: 0 },
      );
      const freeBytes = Math.max(0, totals.totalBytes - totals.usedBytes);

      return {
        ...totals,
        freeBytes,
        label: this.formatBytes(totals.totalBytes),
        totalLabel: this.formatBytes(totals.totalBytes),
        usedLabel: this.formatBytes(totals.usedBytes),
        freeLabel: this.formatBytes(freeBytes),
      };
    } catch {
      return null;
    }
  }

  private getConfiguredEngineType(): "cpu" | "cuda" | "vulkan" {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine !== "object" || localEngine === null) {
      return "cpu";
    }

    const engineType = (localEngine as Record<string, unknown>).engineType;

    if (engineType === "cuda" || engineType === "vulkan") {
      return engineType;
    }

    return "cpu";
  }

  private getCachedGgufLayerCount(filePath: string): number | null {
    try {
      const stat = fs.statSync(filePath);
      const cached = this.layerCountCache.get(filePath);

      if (
        cached &&
        cached.size === stat.size &&
        cached.mtimeMs === stat.mtimeMs
      ) {
        return cached.value;
      }

      const value = this.getGgufLayerCount(filePath);
      this.layerCountCache.set(filePath, {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        value,
      });

      return value;
    } catch {
      return null;
    }
  }

  private getGgufLayerCount(filePath: string): number | null {
    try {
      const fd = fs.openSync(filePath, "r");

      try {
        const header = Buffer.alloc(24);
        fs.readSync(fd, header, 0, header.length, 0);

        if (header.toString("utf8", 0, 4) !== "GGUF") {
          return null;
        }

        const metadataCount = Number(header.readBigUInt64LE(16));
        let offset = 24;

        for (let index = 0; index < metadataCount; index += 1) {
          const keyLength = Number(this.readUInt64(fd, offset));
          offset += 8;

          const keyBuffer = Buffer.alloc(keyLength);
          fs.readSync(fd, keyBuffer, 0, keyLength, offset);
          offset += keyLength;

          const valueType = this.readUInt32(fd, offset);
          offset += 4;

          if (keyBuffer.toString("utf8").endsWith(".block_count")) {
            return this.readMetadataIntegerValue(fd, offset, valueType);
          }

          offset = this.skipGgufMetadataValue(fd, offset, valueType);
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return null;
    }

    return null;
  }

  private readMetadataIntegerValue(
    fd: number,
    offset: number,
    valueType: number,
  ): number | null {
    if (valueType === 4) {
      return this.readUInt32(fd, offset);
    }

    if (valueType === 5) {
      return this.readInt32(fd, offset);
    }

    if (valueType === 10 || valueType === 11) {
      return Number(this.readUInt64(fd, offset));
    }

    return null;
  }

  private skipGgufMetadataValue(
    fd: number,
    offset: number,
    valueType: number,
  ): number {
    const fixedSizes: Record<number, number> = {
      0: 1,
      1: 1,
      2: 2,
      3: 2,
      4: 4,
      5: 4,
      6: 4,
      7: 1,
      10: 8,
      11: 8,
      12: 8,
    };

    if (typeof fixedSizes[valueType] === "number") {
      return offset + fixedSizes[valueType];
    }

    if (valueType === 8) {
      const length = Number(this.readUInt64(fd, offset));
      return offset + 8 + length;
    }

    if (valueType === 9) {
      const itemType = this.readUInt32(fd, offset);
      const itemCount = Number(this.readUInt64(fd, offset + 4));
      let cursor = offset + 12;

      for (let index = 0; index < itemCount; index += 1) {
        cursor = this.skipGgufMetadataValue(fd, cursor, itemType);
      }

      return cursor;
    }

    return offset;
  }

  private readUInt32(fd: number, offset: number): number {
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, offset);
    return buffer.readUInt32LE(0);
  }

  private readInt32(fd: number, offset: number): number {
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, offset);
    return buffer.readInt32LE(0);
  }

  private readUInt64(fd: number, offset: number): bigint {
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, offset);
    return buffer.readBigUInt64LE(0);
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
