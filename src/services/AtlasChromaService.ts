import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as vscode from "vscode";
import { ChildProcess, spawn } from "child_process";
import { ChromaClient } from "chromadb";
import { RagRuntimeStatus } from "../interfaces/AtlasRagTypes";

export class AtlasChromaService {
  private process: ChildProcess | null = null;
  private client: ChromaClient | null = null;
  private startupPromise: Promise<ChromaClient> | null = null;
  private startupError: Error | null = null;
  private port: number | null = null;
  private readonly host = "127.0.0.1";
  private readonly dataPath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.dataPath = path.join(
      this.context.globalStorageUri.fsPath,
      "rag",
      "chroma",
    );
  }

  public async ensureReady(): Promise<ChromaClient> {
    if (this.client && this.process) {
      return this.client;
    }

    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this.start();

    try {
      return await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  public getStatus(): RagRuntimeStatus {
    return {
      available: this.resolveBindingPath() !== null,
      running: this.process !== null && this.client !== null,
      host: this.host,
      port: this.port,
      dataPath: this.dataPath,
      errorMessage: this.startupError?.message,
    };
  }

  public stop(): void {
    if (this.process) {
      this.process.kill();
    }

    this.process = null;
    this.client = null;
    this.port = null;
    this.startupError = null;
  }

  private async start(): Promise<ChromaClient> {
    const bindingPath = this.resolveBindingPath();

    if (!bindingPath) {
      throw new Error(
        `Runtime ChromaDB não encontrado para ${process.platform}-${process.arch}.`,
      );
    }

    const runnerPath = path.join(
      this.context.extensionPath,
      "resources",
      "chroma",
      "chroma-runner.cjs",
    );

    if (!fs.existsSync(runnerPath)) {
      throw new Error(`Launcher do ChromaDB não encontrado: ${runnerPath}`);
    }

    fs.mkdirSync(this.dataPath, { recursive: true });
    this.port = await this.findAvailablePort();
    this.startupError = null;

    this.process = spawn(
      process.execPath,
      [
        runnerPath,
        "run",
        "--host",
        this.host,
        "--port",
        String(this.port),
        "--path",
        this.dataPath,
      ],
      {
        cwd: path.dirname(runnerPath),
        env: {
          ...process.env,
          ATLAS_CHROMA_BINDING: bindingPath,
          CHROMADB_VERSION: "bundled",
          ELECTRON_RUN_AS_NODE: "1",
        },
        windowsHide: true,
      },
    );

    this.process.stdout?.on("data", (chunk) => {
      console.log(`[ATLAS ChromaDB] ${chunk.toString().trim()}`);
    });

    this.process.stderr?.on("data", (chunk) => {
      console.warn(`[ATLAS ChromaDB] ${chunk.toString().trim()}`);
    });

    this.process.on("error", (error) => {
      this.startupError = error;
      this.clearStoppedProcess();
    });

    this.process.on("exit", (code) => {
      if (code && code !== 0 && !this.startupError) {
        this.startupError = new Error(
          `O ChromaDB encerrou com o código ${code}.`,
        );
      }

      this.clearStoppedProcess();
    });

    const client = new ChromaClient({
      host: this.host,
      port: this.port,
      ssl: false,
    });

    await this.waitUntilReady(client);
    this.client = client;
    return client;
  }

  private resolveBindingPath(): string | null {
    const bundledPath = path.join(
      this.context.extensionPath,
      "resources",
      "chroma",
      `${process.platform}-${process.arch}`,
      "chromadb-binding.node",
    );

    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    const packageName = this.getBindingPackageName();

    if (!packageName) {
      return null;
    }

    try {
      return require.resolve(packageName);
    } catch {
      return null;
    }
  }

  private getBindingPackageName(): string | null {
    const key = `${process.platform}-${process.arch}`;
    const packages: Record<string, string> = {
      "darwin-arm64": "chromadb-js-bindings-darwin-arm64",
      "darwin-x64": "chromadb-js-bindings-darwin-x64",
      "linux-arm64": "chromadb-js-bindings-linux-arm64-gnu",
      "linux-x64": "chromadb-js-bindings-linux-x64-gnu",
      "win32-x64": "chromadb-js-bindings-win32-x64-msvc",
    };

    return packages[key] ?? null;
  }

  private async waitUntilReady(client: ChromaClient): Promise<void> {
    const deadline = Date.now() + 30000;

    while (Date.now() < deadline) {
      if (this.startupError) {
        throw this.startupError;
      }

      if (!this.process) {
        throw new Error("O ChromaDB encerrou antes de ficar pronto.");
      }

      try {
        await client.heartbeat();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    this.stop();
    throw new Error("O ChromaDB não ficou pronto dentro de 30 segundos.");
  }

  private async findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();

      server.unref();
      server.on("error", reject);
      server.listen(0, this.host, () => {
        const address = server.address();

        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Não foi possível reservar uma porta para o ChromaDB."));
          return;
        }

        const selectedPort = address.port;
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(selectedPort);
        });
      });
    });
  }

  private clearStoppedProcess(): void {
    this.process = null;
    this.client = null;
    this.port = null;
  }
}
