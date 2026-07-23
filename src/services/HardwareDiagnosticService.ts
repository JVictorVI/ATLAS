import * as os from "os";
import { execFileSync } from "child_process";

export type GpuVendor = "nvidia" | "amd" | "intel" | "unknown";

export interface HardwareInfo {
  ram: string;
  cpu: string;
  gpu: string;
  gpuName: string;
  gpuVendor: GpuVendor;
  storage: string;
  ramBytes: number;
  cpuCores: number;
  gpuVramBytes: number;
  storageFreeBytes: number;
  storageType: "SSD" | "HDD" | "UNKNOWN";
}

export class HardwareDiagnosticService {
  private cachedInfo: HardwareInfo | null = null;

  async getHardwareInfo(): Promise<HardwareInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const [ramInfo, cpuInfo, gpuInfo, storageInfo] = await Promise.all([
      this.getRamInfo(),
      this.getCpuInfo(),
      this.getGpuInfo(),
      this.getStorageInfo(),
    ]);

    this.cachedInfo = {
      ram: this.formatBytes(ramInfo.total),
      cpu: `${cpuInfo.model}, ${cpuInfo.cores} núcleos lógicos`,
      gpu:
        gpuInfo.vram > 0
          ? `${gpuInfo.name ? `${gpuInfo.name} - ` : ""}${this.formatBytes(gpuInfo.vram)} VRAM`
          : gpuInfo.name || "GPU integrada ou VRAM não informada",
      gpuName: gpuInfo.name,
      gpuVendor: gpuInfo.vendor,
      storage: `${storageInfo.type} com ${this.formatBytes(storageInfo.free)} livres`,
      ramBytes: ramInfo.total,
      cpuCores: cpuInfo.cores,
      gpuVramBytes: gpuInfo.vram,
      storageFreeBytes: storageInfo.free,
      storageType: storageInfo.type,
    };

    return this.cachedInfo;
  }

  private async getRamInfo(): Promise<{ total: number }> {
    if (process.platform === "win32") {
      try {
        const output = execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_ComputerSystem | Select-Object -ExpandProperty TotalPhysicalMemory | ConvertTo-Json",
          ],
          { encoding: "utf8", timeout: 5000, windowsHide: true },
        );
        const total = Number(JSON.parse(output.trim()));
        if (Number.isFinite(total) && total > 0) {
          return { total };
        }
      } catch {
      }
    }

    const total = os.totalmem();
    return { total };
  }

  private async getCpuInfo(): Promise<{ model: string; cores: number }> {
    if (process.platform === "win32") {
      try {
        const output = execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Processor | Select-Object Name,NumberOfLogicalProcessors | ConvertTo-Json",
          ],
          { encoding: "utf8", timeout: 5000, windowsHide: true },
        );
        const parsed = JSON.parse(output.trim());
        const cpus = Array.isArray(parsed) ? parsed : [parsed];
        const model =
          cpus[0]?.Name?.trim() ||
          os.cpus()[0]?.model ||
          "Processador desconhecido";
        const cores =
          cpus.reduce(
            (sum, cpu) =>
              sum + (Number(cpu.NumberOfLogicalProcessors) || 0),
            0,
          ) || os.cpus().length;
        return { model, cores };
      } catch {
      }
    }

    const cpus = os.cpus();
    return {
      model: cpus[0]?.model || "Processador desconhecido",
      cores: cpus.length,
    };
  }

  private async getGpuInfo(): Promise<{
    vram: number;
    name: string;
    vendor: GpuVendor;
  }> {
    let vram = 0;
    let name = "";

    if (process.platform === "win32") {
      const registryGpu = this.getWindowsRegistryGpuInfo();
      vram = registryGpu.vram;
      name = registryGpu.name;

      const controllers = this.getWindowsVideoControllers();
      const selected = controllers.find((gpu) =>
        /nvidia|amd|radeon|intel|arc|iris|uhd/i.test(gpu.name),
      ) ?? controllers[0];

      if (selected?.name) {
        name = selected.name;
      }

      const nvidia = this.getWindowsNvidiaSmiGpuInfo();
      if (!name && nvidia.name) {
        name = nvidia.name;
      }

      if (vram === 0 && nvidia.vram > 0) {
        vram = nvidia.vram;
      }

      if (vram === 0) {
        const wmiVram = controllers.reduce((sum, gpu) => sum + gpu.vram, 0);

        if (!this.looksLikeTruncatedWmiVram(wmiVram)) {
          vram = wmiVram;
        } else {
          console.warn(
            "[ATLAS] AdapterRAM via WMI parece truncado em ~4GB; ignorando o valor.",
          );
        }
      }
    } else if (process.platform === "linux") {
      name = this.getLinuxGpuName();

      const nvidia = this.getNvidiaSmiVram("nvidia-smi", false);
      vram = nvidia.vram;
      if (!name && nvidia.vram > 0) {
        name = "NVIDIA";
      }

      if (vram === 0) {
        vram = this.getLinuxDrmVram();
      }
    }

    return { vram, name, vendor: this.detectGpuVendor(name) };
  }

  private getWindowsRegistryGpuInfo(): { name: string; vram: number } {
    try {
      const script = [
        "$ErrorActionPreference = 'SilentlyContinue'",
        "$path = 'SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'",
        "$key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($path)",
        "if ($key) {",
        "  foreach ($subName in $key.GetSubKeyNames()) {",
        "    $sub = $key.OpenSubKey($subName)",
        "    if ($sub) {",
        "      $mem = $sub.GetValue('HardwareInformation.qwMemorySize')",
        "      if ($mem) {",
        "        $desc = $sub.GetValue('DriverDesc')",
        "        Write-Output ('{0}|{1}' -f $desc, $mem)",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("; ");

      const output = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", script],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );

      const adapters = output
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => {
          const [adapterName, memory] = line.split("|");

          return {
            name: (adapterName ?? "").trim(),
            vram: Number(memory) || 0,
          };
        })
        .filter((adapter) => adapter.vram > 0);

      const realAdapters = adapters.filter(
        (adapter) => adapter.vram >= 512 * 1024 ** 2,
      );
      const best = (realAdapters.length > 0 ? realAdapters : adapters).sort(
        (left, right) => right.vram - left.vram,
      )[0];

      return best ?? { name: "", vram: 0 };
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String((error as { stderr?: unknown }).stderr ?? "").trim()
          : "";
      console.warn(
        "[ATLAS] Leitura de GPU via registro falhou:",
        error instanceof Error ? error.message : error,
        stderr ? `| stderr: ${stderr}` : "",
      );

      return { name: "", vram: 0 };
    }
  }

  private getWindowsNvidiaSmiGpuInfo(): { name: string; vram: number } {
    const candidates = [
      "nvidia-smi",
      "nvidia-smi.exe",
      "C:\\Windows\\System32\\nvidia-smi.exe",
      "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
    ];

    for (const candidate of candidates) {
      const gpu = this.getNvidiaSmiGpuInfo(candidate, true);

      if (gpu.name || gpu.vram > 0) {
        return gpu;
      }
    }

    return { name: "", vram: 0 };
  }

  private getWindowsVideoControllers(): Array<{ name: string; vram: number }> {
    try {
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json",
        ],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );
      const parsed = JSON.parse(output.trim());
      const controllers = Array.isArray(parsed) ? parsed : [parsed];

      return controllers
        .map((gpu) => ({
          name: String(gpu?.Name ?? "").trim(),
          vram: Number(gpu?.AdapterRAM) || 0,
        }))
        .filter(
          (gpu) =>
            gpu.name &&
            !/microsoft basic|remote display/i.test(gpu.name),
        );
    } catch {
      return [];
    }
  }

  private getLinuxGpuName(): string {
    try {
      const output = execFileSync(
        "sh",
        [
          "-c",
          "command -v lspci >/dev/null 2>&1 && lspci | grep -Ei 'vga|3d|display' || true",
        ],
        { encoding: "utf8", timeout: 5000 },
      );
      return output.trim().split(/\r?\n/)[0]?.trim() ?? "";
    } catch {
      return "";
    }
  }

  private getLinuxDrmVram(): number {
    try {
      const output = execFileSync(
        "sh",
        [
          "-c",
          "find /sys/class/drm -name mem_info_vram_total -print -quit 2>/dev/null | xargs -r cat",
        ],
        { encoding: "utf8", timeout: 5000 },
      );
      const detected = Number(output.trim());
      return Number.isFinite(detected) && detected > 0 ? detected : 0;
    } catch {
      return 0;
    }
  }

  private getNvidiaSmiVram(
    command: string,
    windowsHide: boolean,
  ): { vram: number } {
    return { vram: this.getNvidiaSmiGpuInfo(command, windowsHide).vram };
  }

  private getNvidiaSmiGpuInfo(
    command: string,
    windowsHide: boolean,
  ): { name: string; vram: number } {
    try {
      const output = execFileSync(
        command,
        ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
        { encoding: "utf8", timeout: 5000, windowsHide },
      );
      const gpus = output
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [gpuName, gpuMemory] = line
            .split(",")
            .map((part) => part.trim());
          const memoryValue = Number(gpuMemory);

          return {
            name: gpuName,
            vram: Number.isFinite(memoryValue) ? memoryValue * 1024 ** 2 : 0,
          };
        })
        .filter((gpu) => gpu.name || gpu.vram > 0);

      return {
        name: gpus.map((gpu) => gpu.name).filter(Boolean).join(", "),
        vram: gpus.reduce((sum, gpu) => sum + gpu.vram, 0),
      };
    } catch {
      return { name: "", vram: 0 };
    }
  }

  private looksLikeTruncatedWmiVram(vram: number): boolean {
    return vram > 3.5 * 1024 ** 3 && vram <= 4.3 * 1024 ** 3;
  }

  private detectGpuVendor(name: string): GpuVendor {
    if (/nvidia|geforce|quadro|tesla|rtx|gtx/i.test(name)) {
      return "nvidia";
    }

    if (/amd|radeon|advanced micro devices/i.test(name)) {
      return "amd";
    }

    if (/intel|arc|iris|uhd/i.test(name)) {
      return "intel";
    }

    return "unknown";
  }

  private async getStorageInfo(): Promise<{
    free: number;
    type: "SSD" | "HDD" | "UNKNOWN";
  }> {
    if (process.platform === "win32") {
      try {
        const output = execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\" | Select-Object FreeSpace,MediaType | ConvertTo-Json",
          ],
          { encoding: "utf8", timeout: 5000, windowsHide: true },
        );
        const parsed = JSON.parse(output.trim());
        const free = Number(parsed?.FreeSpace) || 0;
        let type: "SSD" | "HDD" | "UNKNOWN" = "UNKNOWN";
        const mediaType = parsed?.MediaType;

        if (typeof mediaType === "number") {
          if (mediaType === 4) {
            type = "SSD";
          } else if (mediaType === 3) {
            type = "HDD";
          }
        }

        if (Number.isFinite(free) && free > 0) {
          return { free, type };
        }
      } catch {
      }
    }

    return { free: 0, type: "UNKNOWN" };
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return "Desconhecido";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${Math.round(value)} ${units[unitIndex]}`;
  }

  clearCache(): void {
    this.cachedInfo = null;
  }
}
