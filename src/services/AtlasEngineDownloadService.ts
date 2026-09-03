import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { execFileSync } from "child_process";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { HardwareDiagnosticService } from "./HardwareDiagnosticService";
import { getAtlasStoragePath } from "../utils/AtlasStoragePaths";

export type EngineType = "cpu" | "cuda" | "vulkan";

type LlamaReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LlamaRelease = {
  tag_name: string;
  assets: LlamaReleaseAsset[];
};

type EngineDownloadPlan = {
  requestedType: EngineType;
  effectiveType: EngineType;
  asset: LlamaReleaseAsset;
  fallbackReason?: string;
};

type EngineDownloadSelection = {
  release: LlamaRelease;
  plan: EngineDownloadPlan;
};

const LLAMA_RELEASES_API_URL =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=20";

const MIN_GPU_ACCELERATION_VRAM_BYTES = 2 * 1024 ** 3;

export class AtlasEngineDownloadService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configManager: AtlasConfigManager,
    private readonly hardwareDiagnosticService: HardwareDiagnosticService,
  ) {}

  public getEnginesDir(): string {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine === "object" && localEngine !== null) {
      const configured = (localEngine as Record<string, unknown>).enginesDir;

      if (typeof configured === "string" && configured.trim()) {
        return configured.trim();
      }
    }

    return getAtlasStoragePath(this.context, "engine");
  }

  public getEngineType(): EngineType {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine === "object" && localEngine !== null) {
      return this.normalizeEngineType(
        (localEngine as Record<string, unknown>).engineType,
      );
    }

    return "cpu";
  }

  public getEngineFolder(engineType: EngineType): string {
    if (engineType === "cuda") {
      return "llama.cpp-cuda";
    }

    if (engineType === "vulkan") {
      return "llama.cpp-vulkan";
    }

    return "llama.cpp";
  }

  public isEngineDownloaded(engineType?: EngineType): boolean {
    const type = engineType ?? this.getEngineType();
    const configuredExecutable = this.getConfiguredLlamaServerPath(type);

    if (configuredExecutable && fs.existsSync(configuredExecutable)) {
      return true;
    }

    return this.isManagedEngineDownloaded(type);
  }

  public isManagedEngineDownloaded(engineType: EngineType): boolean {
    const folder = this.getManagedEnginePath(engineType);

    const executableNames =
      process.platform === "win32"
        ? ["llama-server.exe", "llama-server"]
        : ["llama-server"];

    const hasExecutable = executableNames.some((name) =>
      fs.existsSync(path.join(folder, name)),
    );

    if (!hasExecutable) {
      return false;
    }

    if (engineType === "cuda" && process.platform === "win32") {
      return this.hasCudaRuntimeDlls(folder);
    }

    return true;
  }

  public deleteManagedEngine(engineType: EngineType): boolean {
    const enginesDir = path.resolve(this.getEnginesDir());
    const targetFolder = this.getManagedEnginePath(engineType);
    const relativeTarget = path.relative(enginesDir, targetFolder);

    if (
      relativeTarget !== this.getEngineFolder(engineType) ||
      path.isAbsolute(relativeTarget)
    ) {
      throw new Error(
        "Por segurança, apenas engines instaladas na pasta gerenciada pelo ATLAS podem ser excluídas.",
      );
    }

    if (!fs.existsSync(targetFolder)) {
      return false;
    }

    fs.rmSync(targetFolder, { force: true, recursive: true });
    return true;
  }

  private getConfiguredLlamaServerPath(engineType: EngineType): string {
    const localEngine = this.configManager.getConfig().custom?.localEngine;

    if (typeof localEngine !== "object" || localEngine === null) {
      return "";
    }

    const value = localEngine as Record<string, unknown>;
    const configuredEngineType = this.normalizeEngineType(value.engineType);

    if (configuredEngineType !== engineType) {
      return "";
    }

    const configured = value.llamaServerPath;

    return typeof configured === "string" ? configured.trim() : "";
  }

  private getManagedEnginePath(engineType: EngineType): string {
    return path.resolve(this.getEnginesDir(), this.getEngineFolder(engineType));
  }

  public isAnyEngineDownloaded(): boolean {
    return (["cpu", "cuda", "vulkan"] as EngineType[]).some((engineType) =>
      this.isEngineDownloaded(engineType),
    );
  }

  public async isRecommendedEngineDownloaded(): Promise<boolean> {
    const engineType = await this.selectEngineTypeForCurrentMachine();
    this.saveSelectedEngineType(engineType);
    return this.isEngineDownloaded(engineType);
  }

  public async ensureEngineDownloaded(
    onStatus?: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.throwIfDownloadCancelled(signal);
    const engineType = await this.selectEngineTypeForCurrentMachine();
    this.saveSelectedEngineType(engineType);

    if (this.isEngineDownloaded(engineType)) {
      onStatus?.(
        `Engine da llama já está baixada (${engineType.toUpperCase()}).`,
      );
      return;
    }

    await this.downloadEngine(engineType, onStatus, signal);
  }

  public async ensureConfiguredEngineDownloaded(
    onStatus?: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.throwIfDownloadCancelled(signal);
    const engineType = this.getEngineType();

    if (this.isEngineDownloaded(engineType)) {
      onStatus?.(
        `Engine da llama já está baixada (${engineType.toUpperCase()}).`,
      );
      return;
    }

    await this.downloadEngine(engineType, onStatus, signal);
  }

  public async downloadEngine(
    engineType?: EngineType,
    onStatus?: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.throwIfDownloadCancelled(signal);
    const requestedType =
      engineType ?? (await this.selectEngineTypeForCurrentMachine());
    const enginesDir = this.getEnginesDir();

    onStatus?.("Consultando os releases recentes do llama.cpp no GitHub...");

    const releases = await this.fetchRecentReleases(signal);
    this.throwIfDownloadCancelled(signal);
    const selection = this.resolveDownloadSelection(releases, requestedType);

    if (!selection) {
      const newestVersion = releases[0]?.tag_name ?? "consultada";
      throw new Error(
        `Nenhum pacote do llama.cpp foi encontrado para ${this.describePlatform()} (${requestedType.toUpperCase()}) nos releases recentes a partir da versão ${newestVersion}.`,
      );
    }

    const { release, plan } = selection;

    if (plan.fallbackReason) {
      onStatus?.(plan.fallbackReason);
    }

    this.saveSelectedEngineType(plan.effectiveType);

    const targetFolder = path.join(
      enginesDir,
      this.getEngineFolder(plan.effectiveType),
    );
    const targetFolderAlreadyExisted = fs.existsSync(targetFolder);

    onStatus?.(
      `Baixando a engine da llama (${plan.asset.name}, versão ${release.tag_name})...`,
    );

    fs.mkdirSync(targetFolder, { recursive: true });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-engine-"));
    const archivePath = path.join(tempDir, plan.asset.name);

    try {
      const archiveBuffer = await this.downloadFile(
        plan.asset.browser_download_url,
        signal,
      );
      this.throwIfDownloadCancelled(signal);
      fs.writeFileSync(archivePath, archiveBuffer);

      onStatus?.("Extraindo os arquivos da engine...");

      const extractDir = path.join(tempDir, "extracted");
      fs.mkdirSync(extractDir, { recursive: true });
      this.extractArchive(archivePath, extractDir);
      this.throwIfDownloadCancelled(signal);

      this.copyEngineFiles(extractDir, targetFolder);
      this.throwIfDownloadCancelled(signal);

      if (plan.effectiveType === "cuda" && process.platform === "win32") {
        await this.installCudaRuntimeDlls(
          release,
          plan.asset.name,
          targetFolder,
          onStatus,
          signal,
        );
      }

      this.throwIfDownloadCancelled(signal);

      if (!this.isEngineDownloaded(plan.effectiveType)) {
        throw new Error(
          "A engine foi baixada, mas o executável llama-server não foi encontrado após a extração.",
        );
      }

      onStatus?.(
        `Engine da llama baixada com sucesso (${plan.effectiveType.toUpperCase()}).`,
      );
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      if (signal?.aborted && !targetFolderAlreadyExisted) {
        try {
          fs.rmSync(targetFolder, { recursive: true, force: true });
        } catch {}
      }
    }
  }

  private async selectEngineTypeForCurrentMachine(): Promise<EngineType> {
    const hardwareInfo = await this.hardwareDiagnosticService.getHardwareInfo();

    if (hardwareInfo.gpuVramBytes < MIN_GPU_ACCELERATION_VRAM_BYTES) {
      return "cpu";
    }

    if (hardwareInfo.gpuVendor === "nvidia") {
      return "cuda";
    }

    if (
      hardwareInfo.gpuVendor === "amd" ||
      hardwareInfo.gpuVendor === "intel"
    ) {
      return "vulkan";
    }

    return "vulkan";
  }

  private saveSelectedEngineType(engineType: EngineType): void {
    const config = this.configManager.getConfig();
    const custom = config.custom ?? {};
    const localEngine =
      typeof custom.localEngine === "object" && custom.localEngine !== null
        ? (custom.localEngine as Record<string, unknown>)
        : {};

    config.custom = {
      ...custom,
      localEngine: {
        ...localEngine,
        engineType,
      },
    };
    config.updatedAt = new Date().toISOString();
    this.configManager.saveConfig(config);
  }

  private normalizeEngineType(value: unknown): EngineType {
    if (value === "cuda" || value === "vulkan") {
      return value;
    }

    return "cpu";
  }

  private async fetchRecentReleases(
    signal?: AbortSignal,
  ): Promise<LlamaRelease[]> {
    const response = await fetch(LLAMA_RELEASES_API_URL, {
      headers: {
        "User-Agent": "atlas-vscode-extension",
        Accept: "application/vnd.github+json",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `Falha ao consultar as versões do llama.cpp (HTTP ${response.status}).`,
      );
    }

    const releases = (await response.json()) as LlamaRelease[];

    if (
      !Array.isArray(releases) ||
      releases.length === 0 ||
      releases.some((release) => !Array.isArray(release.assets))
    ) {
      throw new Error(
        "Resposta inesperada ao consultar as versões do llama.cpp.",
      );
    }

    return releases;
  }

  private resolveDownloadSelection(
    releases: LlamaRelease[],
    requestedType: EngineType,
  ): EngineDownloadSelection | null {
    for (const release of releases) {
      const asset = this.selectAssetForPlatform(release, requestedType);

      if (asset) {
        return {
          release,
          plan: { requestedType, effectiveType: requestedType, asset },
        };
      }
    }

    if (requestedType === "cuda") {
      for (const release of releases) {
        const vulkanAsset = this.selectAssetForPlatform(release, "vulkan");

        if (vulkanAsset) {
          return {
            release,
            plan: {
              requestedType,
              effectiveType: "vulkan",
              asset: vulkanAsset,
              fallbackReason:
                "Pacote CUDA não encontrado para esta plataforma nos releases recentes; usando Vulkan como aceleração por GPU.",
            },
          };
        }
      }
    }

    return null;
  }

  private selectAssetForPlatform(
    release: LlamaRelease,
    engineType: EngineType,
  ): LlamaReleaseAsset | null {
    const patterns = this.getAssetPatterns(engineType);

    for (const pattern of patterns) {
      const asset = release.assets.find(
        (candidate) =>
          pattern.test(candidate.name) &&
          candidate.browser_download_url.startsWith("https://"),
      );

      if (asset) {
        return asset;
      }
    }

    return null;
  }

  private async installCudaRuntimeDlls(
    release: LlamaRelease,
    cudaEngineAssetName: string,
    targetFolder: string,
    onStatus?: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.throwIfDownloadCancelled(signal);
    const cudartAsset = this.selectCudaRuntimeAsset(
      release,
      cudaEngineAssetName,
    );

    if (!cudartAsset) {
      onStatus?.(
        "Pacote complementar CUDA runtime não encontrado neste release; mantendo apenas a engine CUDA principal.",
      );
      return;
    }

    onStatus?.(`Baixando DLLs CUDA complementares (${cudartAsset.name})...`);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-cudart-"));
    const archivePath = path.join(tempDir, cudartAsset.name);

    try {
      const archiveBuffer = await this.downloadFile(
        cudartAsset.browser_download_url,
        signal,
      );
      this.throwIfDownloadCancelled(signal);
      fs.writeFileSync(archivePath, archiveBuffer);

      const extractDir = path.join(tempDir, "extracted");
      fs.mkdirSync(extractDir, { recursive: true });
      this.extractArchive(archivePath, extractDir);
      this.throwIfDownloadCancelled(signal);

      const copiedDlls = this.copyDllFiles(extractDir, targetFolder);

      if (copiedDlls === 0) {
        onStatus?.(
          "Pacote CUDA runtime baixado, mas nenhuma DLL foi encontrada para copiar.",
        );
        return;
      }

      onStatus?.(
        `${copiedDlls} DLL(s) CUDA complementar(es) instalada(s) na pasta da engine CUDA.`,
      );
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  private selectCudaRuntimeAsset(
    release: LlamaRelease,
    cudaEngineAssetName: string,
  ): LlamaReleaseAsset | null {
    const cudaVersion = cudaEngineAssetName.match(/cuda-([\d.]+)-x64\.zip$/i)?.[1];
    const exactPattern = cudaVersion
      ? new RegExp(
          `^cudart-llama-bin-win-cuda-${cudaVersion.replace(/\./g, "\\.")}-x64\\.zip$`,
          "i",
        )
      : null;

    if (exactPattern) {
      const exactAsset = release.assets.find(
        (candidate) =>
          exactPattern.test(candidate.name) &&
          candidate.browser_download_url.startsWith("https://"),
      );

      if (exactAsset) {
        return exactAsset;
      }
    }

    return release.assets.find(
      (candidate) =>
        /^cudart-llama-bin-win-cuda-[\d.]+-x64\.zip$/i.test(candidate.name) &&
        candidate.browser_download_url.startsWith("https://"),
    ) ?? null;
  }

  private getAssetPatterns(engineType: EngineType): RegExp[] {
    if (process.platform === "win32") {
      return this.getWindowsAssetPatterns(engineType);
    }

    if (process.platform === "darwin") {
      return process.arch === "arm64"
        ? [
            /^llama-.*-bin-macos-arm64\.tar\.gz$/i,
            /^llama-.*-bin-macos-arm64\.zip$/i,
          ]
        : [
            /^llama-.*-bin-macos-x64\.tar\.gz$/i,
            /^llama-.*-bin-macos-x64\.zip$/i,
          ];
    }

    return this.getLinuxAssetPatterns(engineType);
  }

  private getWindowsAssetPatterns(engineType: EngineType): RegExp[] {
    const arch = process.arch === "arm64" ? "arm64" : "x64";

    if (engineType === "cuda") {
      return [
        /^llama-.*-bin-win-cuda-13(?:\.\d+)*-x64\.zip$/i,
        /^llama-.*-bin-win-cuda-12(?:\.\d+)*-x64\.zip$/i,
        /^llama-.*-bin-win-cuda-[\d.]+-x64\.zip$/i,
      ];
    }

    if (engineType === "vulkan") {
      return [/^llama-.*-bin-win-vulkan-x64\.zip$/i];
    }

    return [new RegExp(`^llama-.*-bin-win-cpu-${arch}\\.zip$`, "i")];
  }

  private getLinuxAssetPatterns(engineType: EngineType): RegExp[] {
    const arch = process.arch === "arm64" ? "arm64" : "x64";

    if (engineType === "cuda") {
      return [
        /^llama-.*-bin-ubuntu-cuda-[\d.]+-x64\.tar\.gz$/i,
        /^llama-.*-bin-ubuntu-cuda-x64\.tar\.gz$/i,
      ];
    }

    if (engineType === "vulkan") {
      return [
        new RegExp(`^llama-.*-bin-ubuntu-vulkan-${arch}\\.tar\\.gz$`, "i"),
      ];
    }

    return [new RegExp(`^llama-.*-bin-ubuntu-${arch}\\.tar\\.gz$`, "i")];
  }

  private describePlatform(): string {
    if (process.platform === "win32") {
      return process.arch === "arm64" ? "Windows ARM64" : "Windows x64";
    }

    if (process.platform === "darwin") {
      return process.arch === "arm64" ? "macOS ARM64" : "macOS x64";
    }

    return process.arch === "arm64" ? "Linux ARM64" : "Linux x64";
  }

  private async downloadFile(
    url: string,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const response = await fetch(url, {
      headers: { "User-Agent": "atlas-vscode-extension" },
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `Falha ao baixar a engine da llama (HTTP ${response.status}).`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    this.throwIfDownloadCancelled(signal);
    return Buffer.from(arrayBuffer);
  }

  private throwIfDownloadCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error("Download da engine cancelado.");
    }
  }

  private extractArchive(archivePath: string, destinationDir: string): void {
    if (/\.zip$/i.test(archivePath)) {
      this.extractZip(archivePath, destinationDir);
      return;
    }

    if (/\.tar\.gz$/i.test(archivePath)) {
      execFileSync("tar", ["-xzf", archivePath, "-C", destinationDir], {
        timeout: 120000,
      });
      return;
    }

    throw new Error(
      `Formato de pacote não suportado: ${path.basename(archivePath)}.`,
    );
  }

  private extractZip(zipPath: string, destinationDir: string): void {
    if (process.platform === "win32") {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
        ],
        { timeout: 120000, windowsHide: true },
      );
      return;
    }

    execFileSync("unzip", ["-o", zipPath, "-d", destinationDir], {
      timeout: 120000,
    });
  }

  private copyEngineFiles(extractDir: string, targetFolder: string): void {
    const serverDir = this.findLlamaServerDir(extractDir);

    if (!serverDir) {
      throw new Error("O pacote baixado não contém o executável llama-server.");
    }

    for (const entry of fs.readdirSync(serverDir)) {
      const source = path.join(serverDir, entry);
      const destination = path.join(targetFolder, entry);

      if (fs.statSync(source).isDirectory()) {
        fs.cpSync(source, destination, { recursive: true });
      } else {
        fs.copyFileSync(source, destination);
      }
    }

    if (process.platform !== "win32") {
      const serverPath = path.join(targetFolder, "llama-server");

      if (fs.existsSync(serverPath)) {
        fs.chmodSync(serverPath, 0o755);
      }
    }
  }

  private copyDllFiles(sourceDir: string, targetFolder: string): number {
    const queue: string[] = [sourceDir];
    let copiedDlls = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        const source = path.join(current, entry.name);

        if (entry.isDirectory()) {
          queue.push(source);
          continue;
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith(".dll")) {
          fs.copyFileSync(source, path.join(targetFolder, entry.name));
          copiedDlls++;
        }
      }
    }

    return copiedDlls;
  }

  private hasCudaRuntimeDlls(folder: string): boolean {
    if (!fs.existsSync(folder)) {
      return false;
    }

    return fs.readdirSync(folder).some((entry) =>
      /^cudart64_\d+\.dll$/i.test(entry) ||
      /^cublas(?:lt)?64_\d+\.dll$/i.test(entry),
    );
  }

  private findLlamaServerDir(rootDir: string): string | null {
    const executableNames =
      process.platform === "win32"
        ? ["llama-server.exe", "llama-server"]
        : ["llama-server"];

    const queue: string[] = [rootDir];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      if (
        entries.some(
          (entry) => entry.isFile() && executableNames.includes(entry.name),
        )
      ) {
        return current;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          queue.push(path.join(current, entry.name));
        }
      }
    }

    return null;
  }
}
