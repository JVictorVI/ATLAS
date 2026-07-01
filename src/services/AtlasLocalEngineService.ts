import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  ChildProcessWithoutNullStreams,
  spawn,
  spawnSync,
} from "child_process";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasModelConfig } from "../interfaces/AtlasConfigTypes";
import { ATLAS_LOCAL_MODEL_DEFAULTS } from "./AtlasLocalModelDefaults";

type LocalEngineStartOptions = {
  reason?: "parameter-update";
};

export class AtlasLocalEngineService {
  private process: ChildProcessWithoutNullStreams | null = null;
  private runningModelId: string | null = null;
  private runningEngineType: "cpu" | "cuda" | "vulkan" | null = null;
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

  public async ensureEngine(
    model: AtlasModelConfig,
    options: LocalEngineStartOptions = {},
  ): Promise<void> {
    if (!model.path || !fs.existsSync(model.path)) {
      throw new Error(
        `Arquivo GGUF não encontrado para o modelo local "${model.name}".`,
      );
    }

    const engineSettings = this.getEngineSettings();
    const executable = this.resolveLlamaServerExecutable(model, engineSettings);

    if (
      this.process &&
      this.runningModelId === model.id &&
      this.runningEngineType === engineSettings.engineType &&
      this.runningExecutablePath === executable
    ) {
      return;
    }

    if (this.process) {
      await this.emitStatus(
        `Trocando a engine local para ${model.name}. A engine anterior sera descarregada.`,
      );
      this.stopEngine();
      await this.waitAfterStop();
    }

    const isParameterUpdate = options.reason === "parameter-update";

    if (isParameterUpdate) {
      console.info(
        "[ATLAS local engine] Reinício solicitado para aplicar novos parâmetros.",
        {
          modelId: model.id,
          modelName: model.name,
          contextWindow: model.parameters.contextWindow,
          maxTokens: model.parameters.maxTokens,
          engineType: engineSettings.engineType,
          executable,
        },
      );
    }

    await this.emitStatus(
      isParameterUpdate
        ? `Reiniciando a engine local para aplicar os novos parâmetros de ${model.name}. Isso pode levar alguns segundos.`
        : `Inicializando a engine local para ${model.name}. Isso pode levar alguns segundos.`,
    );

    const args = this.buildLlamaServerArgs(model);

    await this.emitStatus(
      isParameterUpdate
        ? `Aplicando novos parâmetros na engine ${engineSettings.engineType.toUpperCase()}`
        : `Inicializando a engine ${engineSettings.engineType.toUpperCase()}`,
    );

    this.process = spawn(executable, args, {
      cwd: path.dirname(executable),
      windowsHide: true,
    });
    this.runningModelId = model.id;
    this.runningEngineType = engineSettings.engineType;
    this.runningExecutablePath = executable;
    this.startupError = null;

    this.process.stdout.on("data", (chunk) => {
      console.log(`[ATLAS local engine] ${chunk.toString().trim()}`);
    });

    this.process.stderr.on("data", (chunk) => {
      console.warn(`[ATLAS local engine] ${chunk.toString().trim()}`);
    });

    this.process.on("error", (error) => {
      this.startupError = error;
      this.process = null;
      this.runningModelId = null;
      this.runningEngineType = null;
      this.runningExecutablePath = null;
    });

    this.process.on("exit", () => {
      this.process = null;
      this.runningModelId = null;
      this.runningEngineType = null;
      this.runningExecutablePath = null;
    });

    await this.waitUntilReady();
    if (isParameterUpdate) {
      console.info(
        "[ATLAS local engine] Novos parâmetros aplicados; engine local pronta.",
        {
          modelId: model.id,
          modelName: model.name,
          contextWindow: model.parameters.contextWindow,
          maxTokens: model.parameters.maxTokens,
          engineType: engineSettings.engineType,
        },
      );
    }
    await this.emitStatus(`Engine local pronta: ${model.name}.`);
  }

  public stopEngine(options: { force?: boolean } = {}): void {
    const runningProcess = this.process;

    if (!runningProcess) {
      return;
    }

    const pid = runningProcess.pid;
    this.process = null;
    this.runningModelId = null;
    this.runningEngineType = null;
    this.runningExecutablePath = null;

    if (options.force) {
      this.forceKillProcess(runningProcess, pid);
      return;
    }

    runningProcess.kill();
  }

  public async restartEngine(
    model: AtlasModelConfig,
    options: LocalEngineStartOptions = {},
  ): Promise<void> {
    this.stopEngine();
    await this.waitAfterStop();
    await this.ensureEngine(model, options);
  }

  private resolveLlamaServerExecutable(
    model: AtlasModelConfig,
    engineSettings: {
      engineType: "cpu" | "cuda" | "vulkan";
    },
  ): string {
    const configured = this.getConfiguredLlamaServerPath(model, engineSettings);
    const engineFolder = this.getEngineFolder(engineSettings.engineType);
    const enginesDir = this.getEnginesDir();

    const candidates = [
      configured,
      path.join(enginesDir, engineFolder, "llama-server.exe"),
      path.join(enginesDir, engineFolder, "llama-server"),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    if (engineSettings.engineType !== "cpu") {
      throw new Error(
        `Engine ${engineSettings.engineType.toUpperCase()} selecionada, mas os arquivos necessários não foram encontrados em ${path.join(enginesDir, engineFolder)}.`,
      );
    }

    const fallbackCandidates = [
      path.join(enginesDir, "bin", "llama-server.exe"),
      path.join(enginesDir, "bin", "llama-server"),
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
    engineSettings: {
      engineType: "cpu" | "cuda" | "vulkan";
    },
  ): string {
    if (typeof model.custom?.llamaServerPath === "string") {
      return model.custom.llamaServerPath;
    }

    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine === "object" && localEngine !== null) {
      const configured = (localEngine as Record<string, unknown>)
        .llamaServerPath;

      if (typeof configured === "string") {
        return configured.trim();
      }
    }

    return "";
  }

  public getEnginesDir(): string {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine === "object" && localEngine !== null) {
      const configured = (localEngine as Record<string, unknown>).enginesDir;

      if (typeof configured === "string" && configured.trim()) {
        return configured.trim();
      }
    }

    return path.join(this.context.extensionPath, "engine");
  }

  private getEngineSettings(): {
    engineType: "cpu" | "cuda" | "vulkan";
  } {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine !== "object" || localEngine === null) {
      return {
        engineType: "cpu",
      };
    }

    const value = localEngine as Record<string, unknown>;

    return {
      engineType: this.normalizeEngineType(value.engineType),
    };
  }

  private normalizeEngineType(value: unknown): "cpu" | "cuda" | "vulkan" {
    if (value === "cuda" || value === "vulkan") {
      return value;
    }

    return "cpu";
  }

  private getEngineFolder(engineType: "cpu" | "cuda" | "vulkan"): string {
    if (engineType === "cuda") {
      return "llama.cpp-cuda";
    }

    if (engineType === "vulkan") {
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
      String(
        model.parameters.contextWindow ??
          ATLAS_LOCAL_MODEL_DEFAULTS.contextWindow,
      ),
    ];

    const gpuLayers = Number(model.parameters.gpuLayers ?? 0);
    if (Number.isFinite(gpuLayers) && gpuLayers >= 0) {
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
          `Não foi possível iniciar o llama-server. Configure o binário em custom.localEngine.llamaServerPath ou coloque-o na pasta de engines configurada. Detalhes: ${this.startupError.message}`,
        );
      }

      if (!this.process) {
        throw new Error("A engine local encerrou antes de ficar pronta.");
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
      "A engine local não ficou pronta a tempo. Verifique o llama-server e o modelo GGUF selecionado.",
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

  private forceKillProcess(
    runningProcess: ChildProcessWithoutNullStreams,
    pid?: number,
  ): void {
    if (process.platform === "win32" && pid) {
      const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });

      if (!result.error && result.status === 0) {
        return;
      }

      const detail =
        result.error?.message ||
        result.stderr.toString().trim() ||
        "sem detalhes";

      console.warn(
        `[ATLAS local engine] Falha ao forcar encerramento com taskkill: ${detail}`,
      );
    }

    runningProcess.kill("SIGKILL");
  }
}
