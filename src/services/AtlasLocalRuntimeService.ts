import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";

export class AtlasLocalRuntimeService {
  private process: ChildProcessWithoutNullStreams | null = null;
  private runningModelId: string | null = null;
  private runningRuntimeType: "cpu" | "cuda" | "vulkan" | null = null;
  private runningExecutablePath: string | null = null;
  private startupError: Error | null = null;
  private statusListener?: (message: string) => void | Promise<void>;
  private readonly host = "127.0.0.1";
  private readonly port = 8080;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
  ) {}

  public onStatus(listener: (message: string) => void | Promise<void>): void {
    this.statusListener = listener;
  }

  public isRunning(): boolean {
    return this.process !== null;
  }

  public async ensureRuntime(model: AtlasModelConfig): Promise<void> {
    if (!model.path || !fs.existsSync(model.path)) {
      throw new Error(
        `Arquivo GGUF não encontrado para o modelo local "${model.name}".`,
      );
    }

    const runtimeSettings = this.getRuntimeSettings();
    const executable = this.resolveLlamaServerExecutable(
      model,
      runtimeSettings,
    );

    if (
      this.process &&
      this.runningModelId === model.id &&
      this.runningRuntimeType === runtimeSettings.runtimeType &&
      this.runningExecutablePath === executable
    ) {
      return;
    }

    if (this.process) {
      await this.emitStatus(
        `Trocando runtime local para ${model.name}. O runtime anterior sera descarregado.`,
      );
      this.stopRuntime();
      await this.waitAfterStop();
    }

    await this.emitStatus(
      `Iniciando runtime local para ${model.name}. Isso pode levar alguns segundos.`,
    );

    const args = this.buildLlamaServerArgs(model);

    await this.emitStatus(
      `Usando runtime ${runtimeSettings.runtimeType.toUpperCase()}: ${executable}`,
    );

    this.process = spawn(executable, args, {
      cwd: this.context.extensionPath,
      windowsHide: true,
    });
    this.runningModelId = model.id;
    this.runningRuntimeType = runtimeSettings.runtimeType;
    this.runningExecutablePath = executable;
    this.startupError = null;

    this.process.stdout.on("data", (chunk) => {
      console.log(`[ATLAS local runtime] ${chunk.toString().trim()}`);
    });

    this.process.stderr.on("data", (chunk) => {
      console.warn(`[ATLAS local runtime] ${chunk.toString().trim()}`);
    });

    this.process.on("error", (error) => {
      this.startupError = error;
      this.process = null;
      this.runningModelId = null;
      this.runningRuntimeType = null;
      this.runningExecutablePath = null;
    });

    this.process.on("exit", () => {
      this.process = null;
      this.runningModelId = null;
      this.runningRuntimeType = null;
      this.runningExecutablePath = null;
    });

    await this.waitUntilReady();
    await this.emitStatus(`Runtime local pronto: ${model.name}.`);
  }

  public stopRuntime(): void {
    if (!this.process) {
      return;
    }

    this.process.kill();
    this.process = null;
    this.runningModelId = null;
    this.runningRuntimeType = null;
    this.runningExecutablePath = null;
  }

  public async restartRuntime(model: AtlasModelConfig): Promise<void> {
    this.stopRuntime();
    await this.waitAfterStop();
    await this.ensureRuntime(model);
  }

  private resolveLlamaServerExecutable(
    model: AtlasModelConfig,
    runtimeSettings: {
      runtimeType: "cpu" | "cuda" | "vulkan";
    },
  ): string {
    const configured = this.getConfiguredLlamaServerPath(
      model,
      runtimeSettings,
    );
    const runtimeFolder = this.getRuntimeFolder(runtimeSettings.runtimeType);

    const candidates = [
      configured,
      path.join(
        this.context.extensionPath,
        "runtime",
        runtimeFolder,
        "llama-server.exe",
      ),
      path.join(
        this.context.extensionPath,
        "runtime",
        runtimeFolder,
        "llama-server",
      ),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    if (runtimeSettings.runtimeType !== "cpu") {
      throw new Error(
        `Runtime ${runtimeSettings.runtimeType.toUpperCase()} selecionado, mas o llama-server não foi encontrado em runtime/${runtimeFolder}.`,
      );
    }

    const fallbackCandidates = [
      path.join(this.context.extensionPath, "bin", "llama-server.exe"),
      path.join(this.context.extensionPath, "bin", "llama-server"),
    ];

    for (const candidate of fallbackCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return process.platform === "win32" ? "llama-server.exe" : "llama-server";
  }

  private getConfiguredLlamaServerPath(
    model: AtlasModelConfig,
    runtimeSettings: {
      runtimeType: "cpu" | "cuda" | "vulkan";
    },
  ): string {
    if (typeof model.custom?.llamaServerPath === "string") {
      return model.custom.llamaServerPath;
    }

    return "";
  }

  private getRuntimeSettings(): {
    runtimeType: "cpu" | "cuda" | "vulkan";
  } {
    const localRuntime = this.configManager.getConfig().custom?.localRuntime;

    if (typeof localRuntime !== "object" || localRuntime === null) {
      return {
        runtimeType: "cpu",
      };
    }

    const value = localRuntime as Record<string, unknown>;

    return {
      runtimeType: this.normalizeRuntimeType(value.runtimeType),
    };
  }

  private normalizeRuntimeType(value: unknown): "cpu" | "cuda" | "vulkan" {
    if (value === "cuda" || value === "vulkan") {
      return value;
    }

    return "cpu";
  }

  private getRuntimeFolder(runtimeType: "cpu" | "cuda" | "vulkan"): string {
    if (runtimeType === "cuda") {
      return "llama.cpp-cuda";
    }

    if (runtimeType === "vulkan") {
      return "llama.cpp-vulkan";
    }

    return "llama.cpp";
  }

  private buildLlamaServerArgs(model: AtlasModelConfig): string[] {
    const args = [
      "--host",
      this.host,
      "--port",
      String(this.port),
      "--model",
      model.path!,
      "--ctx-size",
      String(model.parameters.contextWindow ?? 4096),
    ];

    const gpuLayers = Number(model.parameters.gpuLayers ?? 0);
    if (Number.isFinite(gpuLayers) && gpuLayers > 0) {
      args.push("--n-gpu-layers", String(gpuLayers));
    }

    return args;
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + 30000;
    const healthUrl = `http://${this.host}:${this.port}/health`;
    const modelsUrl = `http://${this.host}:${this.port}/v1/models`;

    while (Date.now() < deadline) {
      if (this.startupError) {
        throw new Error(
          `Não foi possível iniciar o llama-server. Configure o binário em custom.localRuntime.llamaServerPath ou coloque-o em runtime/llama.cpp. Detalhes: ${this.startupError.message}`,
        );
      }

      if (!this.process) {
        throw new Error("O runtime local encerrou antes de ficar pronto.");
      }

      if (
        (await this.canFetch(healthUrl)) ||
        (await this.canFetch(modelsUrl))
      ) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
      "O runtime local não ficou pronto a tempo. Verifique o llama-server e o modelo GGUF selecionado.",
    );
  }

  private async canFetch(url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async emitStatus(message: string): Promise<void> {
    await this.statusListener?.(message);
  }

  private async waitAfterStop(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}
