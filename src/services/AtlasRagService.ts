import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import {
  RagChunkRecord,
  RagIndexedSource,
  RagIndexingProgress,
  RagProjectIndex,
  RagRuntimeStatus,
  RagSearchResult,
} from "../interfaces/AtlasRagTypes";
import { AtlasRagRepository } from "../repository/AtlasRagRepository";
import { AtlasChromaService } from "./AtlasChromaService";
import { AtlasEmbeddingService } from "./AtlasEmbeddingService";

export class AtlasRagService {
  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly chromaService: AtlasChromaService,
    private readonly embeddingService: AtlasEmbeddingService,
    private readonly repository: AtlasRagRepository,
  ) {}

  public async initialize(): Promise<RagRuntimeStatus> {
    await this.chromaService.ensureReady();
    return this.chromaService.getStatus();
  }

  public getRuntimeStatus(): RagRuntimeStatus {
    return this.chromaService.getStatus();
  }

  public listProjects(): RagProjectIndex[] {
    return this.repository.listProjects();
  }

  public async indexCurrentWorkspace(
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<RagProjectIndex> {
    const workspaceFolder = this.resolveCurrentWorkspaceFolder();

    if (!workspaceFolder) {
      throw new Error("Abra uma pasta ou workspace antes de indexar o projeto.");
    }

    return this.indexFolder(
      workspaceFolder.uri,
      workspaceFolder.name,
      onProgress,
      signal,
    );
  }

  public async indexSelectedFolder(
    folderUri: vscode.Uri,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<RagProjectIndex> {
    const folderName = path.basename(folderUri.fsPath);

    if (!folderName) {
      throw new Error("A pasta selecionada não possui um nome válido.");
    }

    return this.indexFolder(folderUri, folderName, onProgress, signal);
  }

  private async indexFolder(
    folderUri: vscode.Uri,
    folderName: string,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<RagProjectIndex> {
    await this.initialize();
    const rootPath = folderUri.fsPath;
    const projectId = this.hashText(
      process.platform === "win32" ? rootPath.toLowerCase() : rootPath,
    ).slice(0, 24);
    const collectionName = `atlas_${projectId}`;
    const stagingCollectionName = `${collectionName}_build_${Date.now()}`;
    const previous = this.repository.getProject(projectId);
    const now = new Date().toISOString();
    let project: RagProjectIndex = {
      projectId,
      name: folderName,
      rootPath,
      collectionName,
      status: "indexing",
      embeddingModel: this.embeddingService.getModelId(),
      embeddingDimensions: previous?.embeddingDimensions ?? 0,
      sourceCount: previous?.sourceCount ?? 0,
      chunkCount: previous?.chunkCount ?? 0,
      sizeBytes: previous?.sizeBytes ?? 0,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    this.repository.saveProject(project);

    try {
      const files = await this.scanFolder(folderUri, signal);
      await onProgress?.({
        projectId,
        phase: "scanning",
        processedFiles: 0,
        totalFiles: files.length,
        processedChunks: 0,
        totalChunks: 0,
      });

      const sources: RagIndexedSource[] = [];
      const chunks: Array<Omit<RagChunkRecord, "embedding">> = [];

      for (let index = 0; index < files.length; index += 1) {
        this.throwIfAborted(signal);
        const file = files[index];
        const prepared = await this.prepareSource(
          folderUri,
          projectId,
          file,
        );

        if (prepared) {
          sources.push(prepared.source);
          chunks.push(...prepared.chunks);
        }

        await onProgress?.({
          projectId,
          phase: "chunking",
          processedFiles: index + 1,
          totalFiles: files.length,
          processedChunks: chunks.length,
          totalChunks: chunks.length,
          currentFile: vscode.workspace.asRelativePath(file, false),
        });
      }

      if (chunks.length === 0) {
        throw new Error(
          "Nenhum arquivo textual elegível foi encontrado para indexação.",
        );
      }

      const batchSize = 16;
      let embeddingDimensions = 0;

      for (let offset = 0; offset < chunks.length; offset += batchSize) {
        this.throwIfAborted(signal);
        const batch = chunks.slice(offset, offset + batchSize);
        const embeddings = await this.embeddingService.embedDocuments(
          batch.map((chunk) => chunk.content),
          signal,
        );

        embeddingDimensions =
          embeddingDimensions || embeddings[0]?.length || 0;

        await this.repository.upsertChunks(
          stagingCollectionName,
          batch.map((chunk, index) => ({
            ...chunk,
            embedding: embeddings[index],
          })),
        );

        await onProgress?.({
          projectId,
          phase: "embedding",
          processedFiles: files.length,
          totalFiles: files.length,
          processedChunks: Math.min(offset + batch.length, chunks.length),
          totalChunks: chunks.length,
        });
      }

      await onProgress?.({
        projectId,
        phase: "saving",
        processedFiles: files.length,
        totalFiles: files.length,
        processedChunks: chunks.length,
        totalChunks: chunks.length,
      });

      await this.repository.replaceCollection(
        stagingCollectionName,
        collectionName,
      );

      project = {
        ...project,
        status: "ready",
        embeddingDimensions,
        sourceCount: sources.length,
        chunkCount: chunks.length,
        sizeBytes:
          sources.reduce((total, source) => total + source.sizeBytes, 0) +
          chunks.length * embeddingDimensions * Float32Array.BYTES_PER_ELEMENT,
        updatedAt: new Date().toISOString(),
        errorMessage: undefined,
      };
      this.repository.replaceProjectSources(projectId, sources);
      this.repository.saveProject(project);

      await onProgress?.({
        projectId,
        phase: "completed",
        processedFiles: files.length,
        totalFiles: files.length,
        processedChunks: chunks.length,
        totalChunks: chunks.length,
      });

      return project;
    } catch (error) {
      await this.repository
        .deleteCollection(stagingCollectionName)
        .catch(() => undefined);

      if (error instanceof Error && error.name === "AbortError") {
        this.repository.saveProject(
          previous ?? {
            ...project,
            status: "not-indexed",
            updatedAt: new Date().toISOString(),
            errorMessage: undefined,
          },
        );
        throw error;
      }

      project = {
        ...project,
        status: previous?.status === "ready" ? "outdated" : "error",
        updatedAt: new Date().toISOString(),
        errorMessage:
          error instanceof Error ? error.message : "Falha na indexação.",
      };
      this.repository.saveProject(project);
      throw error;
    }
  }

  public async deleteProjectIndex(projectId: string): Promise<void> {
    await this.repository.deleteProject(projectId);
  }

  public async upsertChunks(
    collectionName: string,
    chunks: Omit<RagChunkRecord, "embedding">[],
    signal?: AbortSignal,
  ): Promise<void> {
    const embeddings = await this.embeddingService.embedDocuments(
      chunks.map((chunk) => chunk.content),
      signal,
    );

    await this.repository.upsertChunks(
      collectionName,
      chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
      })),
    );
  }

  public async search(
    collectionName: string,
    query: string,
    topK: number,
    signal?: AbortSignal,
  ): Promise<RagSearchResult[]> {
    const queryEmbedding = await this.embeddingService.embedQuery(
      query,
      signal,
    );

    return this.repository.search(collectionName, queryEmbedding, topK);
  }

  public async retrieveContext(
    query: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const searchId = crypto.randomUUID().slice(0, 8);
    const startedAt = Date.now();
    const settings = this.configManager.getConfig().rag;

    console.group(`[ATLAS RAG][${searchId}] Busca semântica`);
    console.log("Pergunta:", query);
    console.log("Configuração:", {
      enabled: settings.enabled,
      mode: this.configManager.getCurrentMode(),
      offlineOnly: settings.offlineOnly,
      allowCloudContext: settings.allowCloudContext,
      embeddingModel: settings.embeddingModel,
      topK: settings.topK,
      maxContextCharacters: settings.maxContextCharacters,
    });

    if (!settings.enabled || !query.trim()) {
      console.log(
        "Busca ignorada:",
        !settings.enabled ? "RAG desabilitado." : "Pergunta vazia.",
      );
      console.groupEnd();
      return [];
    }

    if (
      this.configManager.isCloudMode() &&
      (settings.offlineOnly || !settings.allowCloudContext)
    ) {
      console.log(
        "Busca bloqueada: contexto RAG não autorizado para o modo cloud.",
      );
      console.groupEnd();
      return [];
    }

    const workspaceFolder = this.resolveCurrentWorkspaceFolder();

    if (!workspaceFolder) {
      console.log("Busca ignorada: nenhum workspace ativo.");
      console.groupEnd();
      return [];
    }

    const rootPath = workspaceFolder.uri.fsPath;
    const projectId = this.hashText(
      process.platform === "win32" ? rootPath.toLowerCase() : rootPath,
    ).slice(0, 24);
    const project = this.repository.getProject(projectId);

    if (!project || project.status !== "ready") {
      console.log("Busca ignorada: índice não está pronto.", {
        projectId,
        projectFound: Boolean(project),
        status: project?.status ?? "not-indexed",
      });
      console.groupEnd();
      return [];
    }

    console.log("Índice selecionado:", {
      projectId: project.projectId,
      projectName: project.name,
      collectionName: project.collectionName,
      sources: project.sourceCount,
      chunks: project.chunkCount,
      embeddingDimensions: project.embeddingDimensions,
    });

    try {
      const embeddingStartedAt = Date.now();
      console.log("Gerando embedding da pergunta...");
      const queryEmbedding = await this.embeddingService.embedQuery(
        query,
        signal,
      );
      console.log("Embedding gerado:", {
        dimensions: queryEmbedding.length,
        durationMs: Date.now() - embeddingStartedAt,
        preview: queryEmbedding
          .slice(0, 6)
          .map((value) => Number(value.toFixed(5))),
      });

      const queryStartedAt = Date.now();
      console.log("Consultando ChromaDB...", {
        collectionName: project.collectionName,
        topK: settings.topK,
      });
      const results = await this.repository.search(
        project.collectionName,
        queryEmbedding,
        settings.topK,
      );
      console.log("Resultados retornados:", {
        count: results.length,
        durationMs: Date.now() - queryStartedAt,
      });

      results.forEach((result, index) => {
        console.groupCollapsed(
          `[ATLAS RAG][${searchId}] #${index + 1} ${result.relativePath}:${result.startLine ?? "?"}-${result.endLine ?? "?"}`,
        );
        console.log("Identificação:", {
          chunkId: result.chunkId,
          sourceId: result.sourceId,
          sourceType: result.sourceType,
          language: result.language,
        });
        console.log("Distância vetorial:", result.distance);
        console.log("Conteúdo recuperado:\n", result.content);
        console.groupEnd();
      });

      const context: string[] = [];
      let currentSize = 0;

      for (const result of results) {
        const formatted = [
          `Fonte: ${result.relativePath}`,
          result.startLine && result.endLine
            ? `Linhas: ${result.startLine}-${result.endLine}`
            : undefined,
          `Distância vetorial: ${result.distance.toFixed(4)}`,
          "",
          result.content,
        ]
          .filter((item): item is string => Boolean(item))
          .join("\n");

        if (
          context.length > 0 &&
          currentSize + formatted.length > settings.maxContextCharacters
        ) {
          console.log("Orçamento de contexto atingido:", {
            selectedChunks: context.length,
            currentCharacters: currentSize,
            nextChunkCharacters: formatted.length,
            limit: settings.maxContextCharacters,
          });
          break;
        }

        context.push(formatted);
        currentSize += formatted.length;
      }

      console.log("Contexto final preparado:", {
        selectedChunks: context.length,
        characters: currentSize,
        durationMs: Date.now() - startedAt,
      });

      return context;
    } catch (error) {
      console.error("Falha durante a busca RAG:", error);
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  public dispose(): void {
    this.chromaService.stop();
  }

  private resolveCurrentWorkspaceFolder(): vscode.WorkspaceFolder | null {
    const activeDocument = vscode.window.activeTextEditor?.document;

    if (activeDocument) {
      const activeFolder = vscode.workspace.getWorkspaceFolder(
        activeDocument.uri,
      );

      if (activeFolder) {
        return activeFolder;
      }
    }

    return vscode.workspace.workspaceFolders?.[0] ?? null;
  }

  private async scanFolder(
    folderUri: vscode.Uri,
    signal?: AbortSignal,
  ): Promise<vscode.Uri[]> {
    this.throwIfAborted(signal);
    const ignored = new Set([
      ...this.configManager.getConfig().rag.ignoredPaths,
      ".git",
      ".svn",
      ".hg",
      "node_modules",
      "dist",
      "build",
      "out",
      "coverage",
      ".next",
      ".nuxt",
      "vendor",
      "bin",
      "obj",
    ]);
    const gitIgnoreEntries = await this.readGitIgnoreEntries(folderUri);

    for (const entry of gitIgnoreEntries) {
      ignored.add(entry);
    }

    const excludePattern = `{${Array.from(ignored)
      .map((entry) => {
        const normalized = entry.replace(/\\/g, "/").replace(/^\/+/, "");

        if (!normalized.includes("*")) {
          return `**/${normalized}/**`;
        }

        if (!normalized.includes("/")) {
          return `**/${normalized}`;
        }

        return normalized;
      })
      .join(",")}}`;
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folderUri, "**/*"),
      excludePattern,
    );

    return files.filter((uri) => this.isIndexableFile(uri));
  }

  private async readGitIgnoreEntries(
    folderUri: vscode.Uri,
  ): Promise<string[]> {
    const gitIgnoreUri = vscode.Uri.joinPath(folderUri, ".gitignore");

    try {
      const bytes = await vscode.workspace.fs.readFile(gitIgnoreUri);
      return Buffer.from(bytes)
        .toString("utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
          (line) =>
            Boolean(line) &&
            !line.startsWith("#") &&
            !line.startsWith("!"),
        )
        .map((line) => line.replace(/\/+$/, ""));
    } catch {
      return [];
    }
  }

  private isIndexableFile(uri: vscode.Uri): boolean {
    const extension = path.extname(uri.fsPath).toLowerCase();
    const allowedExtensions = new Set([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".py",
      ".java",
      ".kt",
      ".kts",
      ".cs",
      ".cpp",
      ".cc",
      ".c",
      ".h",
      ".hpp",
      ".go",
      ".rs",
      ".php",
      ".rb",
      ".swift",
      ".dart",
      ".vue",
      ".svelte",
      ".html",
      ".css",
      ".scss",
      ".sql",
      ".json",
      ".yaml",
      ".yml",
      ".xml",
      ".toml",
      ".md",
      ".txt",
    ]);

    return allowedExtensions.has(extension);
  }

  private async prepareSource(
    folderUri: vscode.Uri,
    projectId: string,
    uri: vscode.Uri,
  ): Promise<{
    source: RagIndexedSource;
    chunks: Array<Omit<RagChunkRecord, "embedding">>;
  } | null> {
    const stat = await vscode.workspace.fs.stat(uri);
    const maxFileSize = 2 * 1024 * 1024;

    if (stat.size === 0 || stat.size > maxFileSize) {
      return null;
    }

    const bytes = await vscode.workspace.fs.readFile(uri);

    if (bytes.includes(0)) {
      return null;
    }

    const content = Buffer.from(bytes).toString("utf8");

    if (!content.trim()) {
      return null;
    }

    const relativePath = path
      .relative(folderUri.fsPath, uri.fsPath)
      .replace(/\\/g, "/");
    const sourceId = this.hashText(`${projectId}:${relativePath}`).slice(0, 32);
    const contentHash = this.hashText(content);
    const language = this.detectLanguage(relativePath);
    const chunks = this.chunkContent(
      content,
      this.configManager.getConfig().rag.chunkSize,
      this.configManager.getConfig().rag.chunkOverlap,
    ).map((chunk, chunkIndex) => {
      const chunkHash = this.hashText(chunk.content);

      return {
        chunkId: this.hashText(
          `${sourceId}:${chunkIndex}:${chunkHash}`,
        ).slice(0, 40),
        projectId,
        sourceId,
        content: [
          `Arquivo: ${relativePath}`,
          `Linguagem: ${language}`,
          `Linhas: ${chunk.startLine}-${chunk.endLine}`,
          "",
          chunk.content,
        ].join("\n"),
        relativePath,
        sourceType: "code" as const,
        language,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkIndex,
        contentHash: chunkHash,
      };
    });

    return {
      source: {
        sourceId,
        projectId,
        type: "code",
        relativePath,
        language,
        contentHash,
        sizeBytes: stat.size,
        modifiedAt: new Date(stat.mtime).toISOString(),
        chunkIds: chunks.map((chunk) => chunk.chunkId),
      },
      chunks,
    };
  }

  private chunkContent(
    content: string,
    configuredSize: number,
    configuredOverlap: number,
  ): Array<{ content: string; startLine: number; endLine: number }> {
    const chunkSize = Math.max(300, configuredSize);
    const overlap = Math.max(
      0,
      Math.min(configuredOverlap, Math.floor(chunkSize / 2)),
    );
    const lines = content.split(/\r?\n/);
    const chunks: Array<{
      content: string;
      startLine: number;
      endLine: number;
    }> = [];
    let startIndex = 0;

    while (startIndex < lines.length) {
      let endIndex = startIndex;
      let currentSize = 0;

      while (endIndex < lines.length) {
        const nextSize = lines[endIndex].length + 1;

        if (endIndex > startIndex && currentSize + nextSize > chunkSize) {
          break;
        }

        currentSize += nextSize;
        endIndex += 1;
      }

      const text = lines.slice(startIndex, endIndex).join("\n").trim();

      if (text) {
        chunks.push({
          content: text,
          startLine: startIndex + 1,
          endLine: endIndex,
        });
      }

      if (endIndex >= lines.length) {
        break;
      }

      let overlapSize = 0;
      let nextStart = endIndex;

      while (nextStart > startIndex) {
        const previousSize = lines[nextStart - 1].length + 1;

        if (overlapSize + previousSize > overlap) {
          break;
        }

        overlapSize += previousSize;
        nextStart -= 1;
      }

      startIndex = Math.max(startIndex + 1, nextStart);
    }

    return chunks;
  }

  private detectLanguage(relativePath: string): string {
    const extension = path.extname(relativePath).toLowerCase();
    const languages: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".py": "python",
      ".java": "java",
      ".kt": "kotlin",
      ".cs": "csharp",
      ".cpp": "cpp",
      ".c": "c",
      ".go": "go",
      ".rs": "rust",
      ".php": "php",
      ".rb": "ruby",
      ".swift": "swift",
      ".dart": "dart",
      ".md": "markdown",
      ".json": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".sql": "sql",
    };

    return languages[extension] ?? (extension.replace(/^\./, "") || "text");
  }

  private hashText(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error("Indexação RAG cancelada.");
      error.name = "AbortError";
      throw error;
    }
  }
}
