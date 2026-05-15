import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";

export class AtlasLocalRuntimeService {
  private process: ChildProcessWithoutNullStreams | null = null;
  private runningModelId: string | null = null;
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
        `Arquivo GGUF nao encontrado para o modelo local "${model.name}".`,
      );
    }

    if (this.process && this.runningModelId === model.id) {
      return;
    }

    if (this.process && this.runningModelId !== model.id) {
      await this.emitStatus(
        `Trocando runtime local para ${model.name}. O modelo anterior sera descarregado.`,
      );
      this.stopRuntime();
      await this.waitAfterStop();
    }

    await this.emitStatus(
      `Iniciando runtime local para ${model.name}. Isso pode levar alguns segundos.`,
    );

    if (this.process) {
      this.stopRuntime();
      await this.waitAfterStop();
    }

    const executable = this.resolveLlamaServerExecutable(model);
    const args = this.buildLlamaServerArgs(model);

    this.process = spawn(executable, args, {
      cwd: this.context.extensionPath,
      windowsHide: true,
    });
    this.runningModelId = model.id;
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
    });

    this.process.on("exit", () => {
      this.process = null;
      this.runningModelId = null;
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
  }

  public async restartRuntime(model: AtlasModelConfig): Promise<void> {
    this.stopRuntime();
    await this.waitAfterStop();
    await this.ensureRuntime(model);
  }

  private resolveLlamaServerExecutable(model: AtlasModelConfig): string {
    const configured = this.getConfiguredLlamaServerPath(model);

    const candidates = [
      configured,
      path.join(
        this.context.extensionPath,
        "runtime",
        "llama.cpp",
        "llama-server.exe",
      ),
      path.join(
        this.context.extensionPath,
        "runtime",
        "llama.cpp",
        "llama-server",
      ),
      path.join(this.context.extensionPath, "bin", "llama-server.exe"),
      path.join(this.context.extensionPath, "bin", "llama-server"),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return process.platform === "win32" ? "llama-server.exe" : "llama-server";
  }

  private getConfiguredLlamaServerPath(model: AtlasModelConfig): string {
    if (typeof model.custom?.llamaServerPath === "string") {
      return model.custom.llamaServerPath;
    }

    const localRuntime = this.configManager.getConfig().custom?.localRuntime;

    if (
      typeof localRuntime === "object" &&
      localRuntime !== null &&
      "llamaServerPath" in localRuntime
    ) {
      const value = (localRuntime as { llamaServerPath?: unknown })
        .llamaServerPath;
      return typeof value === "string" ? value : "";
    }

    return "";
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
          `Nao foi possivel iniciar o llama-server. Configure o binario em custom.localRuntime.llamaServerPath ou coloque-o em runtime/llama.cpp. Detalhes: ${this.startupError.message}`,
        );
      }

      if (!this.process) {
        throw new Error("O runtime local encerrou antes de ficar pronto.");
      }

      if ((await this.canFetch(healthUrl)) || (await this.canFetch(modelsUrl))) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
      "O runtime local nao ficou pronto a tempo. Verifique o llama-server e o modelo GGUF selecionado.",
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
