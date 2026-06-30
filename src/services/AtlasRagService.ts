import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { minimatch } from "minimatch";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import {
  RagChunkRecord,
  RagContextResult,
  RagContextSource,
  RagExternalDocument,
  RagExternalDocumentImportResult,
  RagIndexedSource,
  RagIndexingProgress,
  RagProjectIndex,
  RagRuntimeStatus,
  RagSearchResult,
} from "../interfaces/AtlasRagTypes";
import { AtlasRagRepository } from "../repository/AtlasRagRepository";
import { AtlasChromaService } from "./AtlasChromaService";
import { AtlasEmbeddingService } from "./AtlasEmbeddingService";
import { AtlasExternalDocumentParser } from "./AtlasExternalDocumentParser";

export class AtlasRagService {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly autoIndexTimers = new Map<string, NodeJS.Timeout>();
  private readonly indexingProjects = new Set<string>();
  private readonly externalDocumentParser = new AtlasExternalDocumentParser();
  private projectsChangedListener?: (projects: RagProjectIndex[]) => void;

  constructor(
    private readonly configManager: AtlasConfigManager,
    private readonly chromaService: AtlasChromaService,
    private readonly embeddingService: AtlasEmbeddingService,
    private readonly repository: AtlasRagRepository,
  ) {
    this.repository.normalizeInterruptedIndexes();
    this.refreshProjectWatchers();
  }

  public onProjectsChanged(
    listener: (projects: RagProjectIndex[]) => void,
  ): void {
    this.projectsChangedListener = listener;
  }

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

  public listExternalDocuments(): RagExternalDocument[] {
    const workspaceFolder = this.resolveCurrentWorkspaceFolder();

    if (!workspaceFolder) {
      return this.repository.listExternalDocuments();
    }

    return this.repository.listExternalDocuments(
      this.getProjectId(workspaceFolder.uri.fsPath),
    );
  }

  public async addExternalDocuments(
    uris: vscode.Uri[],
    onProgress?: (progress: {
      processedFiles: number;
      totalFiles: number;
      currentFile?: string;
    }) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<RagExternalDocumentImportResult> {
    if (uris.length === 0) {
      return {
        documents: this.listExternalDocuments(),
        imported: [],
        skipped: [],
      };
    }

    const workspaceFolder = this.resolveCurrentWorkspaceFolder();

    if (!workspaceFolder) {
      throw new Error(
        "Abra uma pasta ou workspace antes de adicionar documentos externos ao RAG.",
      );
    }

    await this.initialize();

    const projectId = this.getProjectId(workspaceFolder.uri.fsPath);
    const imported: RagExternalDocument[] = [];
    const skipped: Array<{ path: string; reason: string }> = [];

    for (let index = 0; index < uris.length; index += 1) {
      this.throwIfAborted(signal);
      const uri = uris[index];
      await onProgress?.({
        processedFiles: index,
        totalFiles: uris.length,
        currentFile: path.basename(uri.fsPath),
      });

      try {
        const prepared = await this.prepareExternalDocument(projectId, uri);
        const collectionName =
          prepared.source.collectionName ??
          this.getExternalCollectionName(projectId);
        const previousSource = this.repository.getSource(
          prepared.source.sourceId,
        );
        const previousCollectionName = previousSource
          ? previousSource.collectionName ??
            this.getExternalCollectionName(
              previousSource.projectId,
              previousSource.embeddingModel,
            )
          : undefined;
        const embeddings = await this.embeddingService.embedDocuments(
          prepared.chunks.map((chunk) => chunk.content),
          signal,
        );

        if (!previousSource || previousCollectionName === collectionName) {
          await this.repository
            .deleteSource(collectionName, prepared.source.sourceId)
            .catch(() => undefined);
        }

        await this.repository.upsertChunks(
          collectionName,
          prepared.chunks.map((chunk, chunkIndex) => ({
            ...chunk,
            embedding: embeddings[chunkIndex],
          })),
        );

        if (
          previousSource &&
          previousCollectionName &&
          previousCollectionName !== collectionName
        ) {
          await this.repository
            .deleteSource(previousCollectionName, previousSource.sourceId)
            .catch(() => undefined);
        }

        this.repository.saveSources([prepared.source]);
        imported.push(this.toExternalDocument(prepared.source));
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }

        skipped.push({
          path: uri.fsPath,
          reason:
            error instanceof Error
              ? error.message
              : "Falha ao processar o documento.",
        });
      }

      await onProgress?.({
        processedFiles: index + 1,
        totalFiles: uris.length,
        currentFile: path.basename(uri.fsPath),
      });
    }

    return {
      documents: this.repository.listExternalDocuments(projectId),
      imported,
      skipped,
    };
  }

  public async deleteExternalDocument(
    sourceId: string,
  ): Promise<RagExternalDocument[]> {
    const source = this.repository.getSource(sourceId);

    if (!source || source.externalDocument !== true) {
      throw new Error("Documento externo RAG nao encontrado.");
    }

    await this.repository.deleteSource(
      source.collectionName ??
        this.getExternalCollectionName(source.projectId, source.embeddingModel),
      source.sourceId,
    );
    this.repository.deleteSourceFromManifest(source.sourceId);
    return this.listExternalDocuments();
  }

  public async deleteAllExternalDocuments(): Promise<RagExternalDocument[]> {
    const workspaceFolder = this.resolveCurrentWorkspaceFolder();

    if (!workspaceFolder) {
      throw new Error(
        "Abra uma pasta ou workspace antes de remover documentos externos do RAG.",
      );
    }

    await this.initialize();

    const projectId = this.getProjectId(workspaceFolder.uri.fsPath);
    const deletedSources =
      this.repository.deleteExternalSourcesFromManifest(projectId);
    const collectionNames = new Set<string>([
      `atlas_${projectId}_external`,
    ]);

    for (const source of deletedSources) {
      collectionNames.add(
        source.collectionName ??
          this.getExternalCollectionName(source.projectId, source.embeddingModel),
      );
    }

    for (const collectionName of collectionNames) {
      await this.repository.deleteCollection(collectionName);
    }

    return this.repository.listExternalDocuments(projectId);
  }

  public markAllProjectsOutdated(reason: string): void {
    let changed = false;

    for (const project of this.repository.listProjects()) {
      if (project.status !== "ready") {
        continue;
      }

      this.repository.updateProjectStatus(
        project.projectId,
        "outdated",
        reason,
      );
      changed = true;
    }

    if (changed) {
      this.emitProjectsChanged();
    }
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

  public registerSelectedFolder(folderUri: vscode.Uri): RagProjectIndex {
    const rootPath = folderUri.fsPath;
    const folderName = path.basename(rootPath);

    if (!folderName) {
      throw new Error("A pasta selecionada não possui um nome válido.");
    }

    const projectId = this.getProjectId(rootPath);
    const previous = this.repository.getProject(projectId);
    const now = new Date().toISOString();
    const project: RagProjectIndex = previous ?? {
      projectId,
      name: folderName,
      rootPath,
      collectionName: `atlas_${projectId}`,
      status: "not-indexed",
      embeddingModel: this.embeddingService.getModelId(),
      embeddingDimensions: 0,
      sourceCount: 0,
      chunkCount: 0,
      sizeBytes: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.repository.saveProject(project);
    this.refreshProjectWatchers();
    this.emitProjectsChanged();
    return project;
  }

  public async indexProject(
    projectId: string,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<RagProjectIndex> {
    const project = this.repository.getProject(projectId);

    if (!project) {
      throw new Error("Projeto RAG não encontrado.");
    }

    return this.indexFolder(
      vscode.Uri.file(project.rootPath),
      project.name,
      onProgress,
      signal,
    );
  }

  private async indexFolder(
    folderUri: vscode.Uri,
    folderName: string,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<RagProjectIndex> {
    await this.initialize();
    const rootPath = folderUri.fsPath;
    const projectId = this.getProjectId(rootPath);
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
    this.indexingProjects.add(projectId);
    this.emitProjectsChanged();

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
      this.refreshProjectWatchers();
      this.emitProjectsChanged();

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
        this.emitProjectsChanged();
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
      this.emitProjectsChanged();
      throw error;
    } finally {
      this.indexingProjects.delete(projectId);
    }
  }

  public async deleteProjectIndex(projectId: string): Promise<void> {
    await this.repository.deleteProject(projectId);
    this.disposeProjectWatcher(projectId);
    this.emitProjectsChanged();
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
  ): Promise<RagContextResult> {
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
      return { context: [], sources: [] };
    }

    if (
      this.configManager.isCloudMode() &&
      (settings.offlineOnly || !settings.allowCloudContext)
    ) {
      console.log(
        "Busca bloqueada: contexto RAG não autorizado para o modo cloud.",
      );
      console.groupEnd();
      return { context: [], sources: [] };
    }

    const workspaceFolder = this.resolveCurrentWorkspaceFolder();

    const rootPath = workspaceFolder?.uri.fsPath;
    const projectId = rootPath ? this.getProjectId(rootPath) : undefined;
    const project = projectId ? this.repository.getProject(projectId) : undefined;
    const canSearchProject = project?.status === "ready";
    const externalSources = settings.includeExternalDocuments
      ? this.repository.listExternalSources(undefined, settings.embeddingModel)
      : [];
    const externalCollectionNames = Array.from(
      new Set(
        externalSources.map(
          (source) =>
            source.collectionName ??
            this.getExternalCollectionName(
              source.projectId,
              source.embeddingModel,
            ),
        ),
      ),
    );
    const canSearchExternal = externalCollectionNames.length > 0;

    if (!canSearchProject && !canSearchExternal) {
      console.log("Busca ignorada: índice não está pronto.", {
        projectId,
        projectFound: Boolean(project),
        status: project?.status ?? "not-indexed",
        externalDocuments: externalSources.length,
      });
      console.groupEnd();
      return { context: [], sources: [] };
    }

    console.log("Índice selecionado:", {
      projectId,
      projectIndexReady: canSearchProject,
      projectName: project?.name,
      collectionName: project?.collectionName,
      externalCollectionNames,
      sources: project?.sourceCount ?? 0,
      chunks: project?.chunkCount ?? 0,
      embeddingDimensions: project?.embeddingDimensions ?? 0,
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
      const candidateCount = Math.max(settings.topK * 5, settings.topK);
      console.log("Consultando ChromaDB...", {
        collectionName: canSearchProject ? project?.collectionName : undefined,
        externalCollectionNames,
        topK: settings.topK,
        candidateCount,
      });
      const candidates = (
        await Promise.all([
          canSearchProject && project
            ? this.repository.search(
                project.collectionName,
                queryEmbedding,
                candidateCount,
              )
            : Promise.resolve([]),
          ...externalCollectionNames.map((collectionName) =>
            this.repository
              .search(collectionName, queryEmbedding, candidateCount)
              .catch((error) => {
                console.warn(
                  "[ATLAS RAG] Falha ao consultar documentos externos:",
                  error,
                );
                return [];
              }),
          ),
        ])
      )
        .flat()
        .sort((left, right) => left.distance - right.distance);
      const results = this.selectRetrievalResults(
        candidates,
        settings,
        workspaceFolder ?? undefined,
      );
      console.log("Resultados retornados:", {
        candidates: candidates.length,
        selected: results.length,
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
          externalDocument: result.externalDocument === true,
          language: result.language,
        });
        console.log("Distância vetorial:", result.distance);
        console.log("Conteúdo recuperado:\n", result.content);
        console.groupEnd();
      });

      const context: string[] = [];
      const sources: RagContextSource[] = [];
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
        sources.push({
          chunkId: result.chunkId,
          relativePath: result.relativePath,
          sourceType: result.sourceType,
          externalDocument: result.externalDocument,
          distance: result.distance,
          relevance: this.distanceToRelevance(result.distance),
          language: result.language,
          startLine: result.startLine,
          endLine: result.endLine,
        });
        currentSize += formatted.length;
      }

      console.log("Contexto final preparado:", {
        selectedChunks: context.length,
        characters: currentSize,
        durationMs: Date.now() - startedAt,
      });

      return { context, sources };
    } catch (error) {
      console.error("Falha durante a busca RAG:", error);
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  private selectRetrievalResults(
    candidates: RagSearchResult[],
    settings: ReturnType<AtlasConfigManager["getConfig"]>["rag"],
    workspaceFolder?: vscode.WorkspaceFolder,
  ): RagSearchResult[] {
    const activeDocument = vscode.window.activeTextEditor?.document;
    const activeFile =
      workspaceFolder &&
      activeDocument &&
      vscode.workspace.getWorkspaceFolder(activeDocument.uri)?.uri.toString() ===
        workspaceFolder.uri.toString()
        ? path
            .relative(workspaceFolder.uri.fsPath, activeDocument.uri.fsPath)
            .replace(/\\/g, "/")
        : null;
    const directoryPatterns = settings.directoryFilters.flatMap((entry) =>
      this.expandFilterPattern(entry),
    );
    const filterStats = {
      candidates: candidates.length,
      relevance: 0,
      generatedFiles: 0,
      externalDocuments: 0,
      activeFile: 0,
      language: 0,
      directory: 0,
      perFileLimit: 0,
    };
    let filtered = candidates.filter((result) => {
      const relevance = this.distanceToRelevance(result.distance);

      if (
        settings.relevanceMode === "maxDistance"
          ? result.distance > settings.relevanceThreshold
          : relevance < settings.relevanceThreshold
      ) {
        filterStats.relevance += 1;
        return false;
      }

      if (this.isGeneratedDependencyFile(result.relativePath)) {
        filterStats.generatedFiles += 1;
        return false;
      }

      if (
        !settings.includeExternalDocuments &&
        result.externalDocument === true
      ) {
        filterStats.externalDocuments += 1;
        return false;
      }

      if (
        settings.excludeActiveFile &&
        activeFile &&
        (process.platform === "win32"
          ? result.relativePath.toLowerCase() === activeFile.toLowerCase()
          : result.relativePath === activeFile)
      ) {
        filterStats.activeFile += 1;
        return false;
      }

      if (
        settings.languageFilters.length &&
        (!result.language ||
          !settings.languageFilters.includes(result.language.toLowerCase()))
      ) {
        filterStats.language += 1;
        return false;
      }

      if (
        directoryPatterns.length &&
        !this.matchesIgnoredPath(result.relativePath, directoryPatterns)
      ) {
        filterStats.directory += 1;
        return false;
      }

      return true;
    });

    if (settings.sourcePriority !== "balanced") {
      const preferredType =
        settings.sourcePriority === "code" ? "code" : "document";
      filtered = filtered.sort((left, right) => {
        const leftPriority = left.sourceType === preferredType ? 0 : 1;
        const rightPriority = right.sourceType === preferredType ? 0 : 1;
        return leftPriority - rightPriority || left.distance - right.distance;
      });
    }

    const perFile = new Map<string, number>();
    const limited = filtered.filter((result) => {
      const count = perFile.get(result.relativePath) ?? 0;

      if (count >= settings.maxChunksPerFile) {
        filterStats.perFileLimit += 1;
        return false;
      }

      perFile.set(result.relativePath, count + 1);
      return true;
    });

    console.log("[ATLAS RAG] Aplicação dos filtros:", {
      ...filterStats,
      afterFilters: filtered.length,
      afterPerFileLimit: limited.length,
      relevanceMode: settings.relevanceMode,
      relevanceThreshold: settings.relevanceThreshold,
    });

    if (!settings.diversifyFiles) {
      return limited.slice(0, settings.topK);
    }

    const selected: RagSearchResult[] = [];
    const deferred: RagSearchResult[] = [];
    const seenFiles = new Set<string>();

    for (const result of limited) {
      if (seenFiles.has(result.relativePath)) {
        deferred.push(result);
      } else {
        selected.push(result);
        seenFiles.add(result.relativePath);
      }
    }

    return [...selected, ...deferred].slice(0, settings.topK);
  }

  private distanceToRelevance(distance: number): number {
    return Math.max(0, Math.min(1, 1 - distance));
  }

  private expandFilterPattern(value: string): string[] {
    const normalized = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\/+|^\/+|\/+$/g, "");

    if (!normalized) {
      return [];
    }

    if (this.isGlobPattern(normalized)) {
      return [normalized, `${normalized}/**`];
    }

    return [normalized, `${normalized}/**`];
  }

  public dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();

    for (const timer of this.autoIndexTimers.values()) {
      clearTimeout(timer);
    }
    this.autoIndexTimers.clear();
    this.chromaService.stop();
  }

  private refreshProjectWatchers(): void {
    const projects = this.repository.listProjects();
    const projectIds = new Set(projects.map((project) => project.projectId));

    for (const projectId of this.watchers.keys()) {
      if (!projectIds.has(projectId)) {
        this.disposeProjectWatcher(projectId);
      }
    }

    for (const project of projects) {
      if (this.watchers.has(project.projectId)) {
        continue;
      }

      const rootUri = vscode.Uri.file(project.rootPath);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootUri, "**/*"),
      );
      const handleChange = (uri: vscode.Uri) => {
        this.handleIndexedProjectChange(project, uri);
      };

      watcher.onDidCreate(handleChange);
      watcher.onDidChange(handleChange);
      watcher.onDidDelete(handleChange);
      this.watchers.set(project.projectId, watcher);
    }
  }

  private handleIndexedProjectChange(
    project: RagProjectIndex,
    uri: vscode.Uri,
  ): void {
    const currentProject =
      this.repository.getProject(project.projectId) ?? project;

    if (
      this.indexingProjects.has(currentProject.projectId) ||
      !this.shouldTrackChangedFile(currentProject.rootPath, uri)
    ) {
      return;
    }

    const autoIndex = this.configManager.getConfig().rag.autoIndex;

    if (
      currentProject.status === "not-indexed" ||
      currentProject.status === "error"
    ) {
      if (autoIndex) {
        this.scheduleAutomaticIndex(currentProject);
      }
      return;
    }

    const updated = this.repository.updateProjectStatus(
      currentProject.projectId,
      "outdated",
      "Arquivos do projeto foram alterados após a última indexação.",
    );

    if (!updated) {
      return;
    }

    console.log("[ATLAS RAG] Índice marcado como desatualizado:", {
      project: updated.name,
      changedFile: path.relative(updated.rootPath, uri.fsPath),
    });
    this.emitProjectsChanged();

    if (autoIndex) {
      this.scheduleAutomaticIndex(updated);
    }
  }

  private shouldTrackChangedFile(rootPath: string, uri: vscode.Uri): boolean {
    const relativePath = path
      .relative(rootPath, uri.fsPath)
      .replace(/\\/g, "/");

    if (
      !relativePath ||
      relativePath.startsWith("../") ||
      path.isAbsolute(relativePath)
    ) {
      return false;
    }

    const ignoredPatterns = this.configManager
      .getConfig()
      .rag.ignoredPaths.flatMap((entry) => this.expandIgnoredPattern(entry));

    if (this.matchesIgnoredPath(relativePath, ignoredPatterns)) {
      return false;
    }

    return this.isIndexableFile(uri);
  }

  private scheduleAutomaticIndex(project: RagProjectIndex): void {
    const currentTimer = this.autoIndexTimers.get(project.projectId);

    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    const timer = setTimeout(() => {
      this.autoIndexTimers.delete(project.projectId);
      void this.indexSelectedFolder(
        vscode.Uri.file(project.rootPath),
      ).catch((error) => {
        console.error(
          `[ATLAS RAG] Falha na reindexação automática de ${project.name}:`,
          error,
        );
      });
    }, this.configManager.getConfig().rag.autoIndexDebounceMs);

    this.autoIndexTimers.set(project.projectId, timer);
  }

  private disposeProjectWatcher(projectId: string): void {
    this.watchers.get(projectId)?.dispose();
    this.watchers.delete(projectId);

    const timer = this.autoIndexTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.autoIndexTimers.delete(projectId);
    }
  }

  private emitProjectsChanged(): void {
    this.projectsChangedListener?.(this.listProjects());
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
    const gitIgnoreEntries = this.configManager.getConfig().rag.respectGitIgnore
      ? await this.readGitIgnoreEntries(folderUri)
      : [];

    for (const entry of gitIgnoreEntries) {
      ignored.add(entry);
    }

    const ignoredPatterns = Array.from(ignored).flatMap((entry) =>
      this.expandIgnoredPattern(entry),
    );
    const excludePattern =
      ignoredPatterns.length > 0 ? `{${ignoredPatterns.join(",")}}` : undefined;
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folderUri, "**/*"),
      excludePattern,
    );

    return files.filter((uri) => {
      const relativePath = path
        .relative(folderUri.fsPath, uri.fsPath)
        .replace(/\\/g, "/");

      return (
        this.isIndexableFile(uri) &&
        !this.matchesIgnoredPath(relativePath, ignoredPatterns)
      );
    });
  }

  private expandIgnoredPattern(value: string): string[] {
    const normalized = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\/+/, "")
      .replace(/^\/+|\/+$/g, "");

    if (!normalized) {
      return [];
    }

    if (this.isGlobPattern(normalized)) {
      const rooted = normalized.includes("/")
        ? normalized
        : `**/${normalized}`;
      return [rooted, `${rooted}/**`];
    }

    return [`**/${normalized}`, `**/${normalized}/**`];
  }

  private matchesIgnoredPath(
    relativePath: string,
    patterns: string[],
  ): boolean {
    return patterns.some((pattern) =>
      minimatch(relativePath, pattern, {
        dot: true,
        matchBase: true,
        nocase: process.platform === "win32",
      }),
    );
  }

  private isGlobPattern(value: string): boolean {
    return /[*?[\]{}()!+@]/.test(value);
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
    const settings = this.configManager.getConfig().rag;
    const allowedExtensions = new Set(settings.allowedExtensions);
    const markdownExtensions = new Set([".md", ".markdown"]);
    const configExtensions = new Set([
      ".json",
      ".jsonc",
      ".yaml",
      ".yml",
      ".xml",
      ".toml",
      ".ini",
      ".cfg",
      ".conf",
      ".properties",
      ".txt",
    ]);

    if (this.isGeneratedDependencyFile(uri.fsPath)) {
      return false;
    }

    if (markdownExtensions.has(extension)) {
      return settings.includeMarkdownFiles;
    }

    if (configExtensions.has(extension)) {
      return settings.includeConfigFiles;
    }

    return allowedExtensions.has(extension);
  }

  private isGeneratedDependencyFile(filePath: string): boolean {
    const fileName = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    const generatedDependencyFiles = new Set([
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "composer.lock",
      "poetry.lock",
      "cargo.lock",
    ]);

    return generatedDependencyFiles.has(fileName);
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
    const maxFileSize = this.configManager.getConfig().rag.maxFileSizeBytes;

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
        sourceType: this.getSourceType(relativePath),
        externalDocument: false,
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
        type: this.getSourceType(relativePath),
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

  private async prepareExternalDocument(
    projectId: string,
    uri: vscode.Uri,
  ): Promise<{
    source: RagIndexedSource;
    chunks: Array<Omit<RagChunkRecord, "embedding">>;
  }> {
    const stat = await vscode.workspace.fs.stat(uri);
    const maxFileSize = this.getExternalDocumentMaxFileSizeBytes();

    if (stat.size === 0) {
      throw new Error("Arquivo vazio.");
    }

    if (stat.size > maxFileSize) {
      throw new Error(
        `Arquivo maior que o limite de ${Math.round(maxFileSize / 1048576)} MB.`,
      );
    }

    if (!this.externalDocumentParser.canParse(uri)) {
      throw new Error("Tipo de arquivo nao suportado para documentos externos.");
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    const parsed = await this.externalDocumentParser.parse(uri, bytes);
    const normalizedPath =
      process.platform === "win32" ? uri.fsPath.toLowerCase() : uri.fsPath;
    const sourceId = this.hashText(
      `${projectId}:external:${normalizedPath}`,
    ).slice(0, 32);
    const contentHash = this.hashText(parsed.content);
    const embeddingModel = this.embeddingService.getModelId();
    const collectionName = this.getExternalCollectionName(
      projectId,
      embeddingModel,
    );
    const relativePath = `Documentos externos/${parsed.displayName}`;
    const chunks = this.chunkContent(
      parsed.content,
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
          `Documento externo: ${parsed.displayName}`,
          `Tipo: ${parsed.fileType}`,
          `Trecho: ${chunk.startLine}-${chunk.endLine}`,
          "",
          chunk.content,
        ].join("\n"),
        relativePath,
        sourceType: "document" as const,
        externalDocument: true,
        language: parsed.language,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkIndex,
        contentHash: chunkHash,
      };
    });

    if (chunks.length === 0) {
      throw new Error("Nenhum chunk foi gerado para o documento.");
    }

    return {
      source: {
        sourceId,
        projectId,
        type: "document",
        relativePath,
        externalDocument: true,
        absolutePath: uri.fsPath,
        displayName: parsed.displayName,
        fileType: parsed.fileType,
        collectionName,
        embeddingModel,
        language: parsed.language,
        contentHash,
        sizeBytes: stat.size,
        modifiedAt: new Date(stat.mtime).toISOString(),
        chunkIds: chunks.map((chunk) => chunk.chunkId),
      },
      chunks,
    };
  }

  private toExternalDocument(source: RagIndexedSource): RagExternalDocument {
    return {
      sourceId: source.sourceId,
      projectId: source.projectId,
      name: source.displayName || path.basename(source.relativePath),
      relativePath: source.relativePath,
      absolutePath: source.absolutePath ?? "",
      fileType: source.fileType ?? source.language ?? "document",
      sizeBytes: source.sizeBytes,
      modifiedAt: source.modifiedAt,
      chunkCount: source.chunkIds.length,
    };
  }

  private getExternalCollectionName(
    projectId: string,
    embeddingModel = this.embeddingService.getModelId(),
  ): string {
    return `atlas_${projectId}_external_${this.hashText(embeddingModel).slice(0, 12)}`;
  }

  private getExternalDocumentMaxFileSizeBytes(): number {
    const settings = this.configManager.getConfig().rag;
    return settings.externalDocumentMaxFileSizeBytes ?? 25 * 1024 * 1024;
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

  private getSourceType(relativePath: string): "code" | "document" {
    const extension = path.extname(relativePath).toLowerCase();
    const documentationExtensions = new Set([
      ".md",
      ".markdown",
      ".txt",
      ".json",
      ".jsonc",
      ".yaml",
      ".yml",
      ".xml",
      ".toml",
      ".ini",
      ".cfg",
      ".conf",
      ".properties",
    ]);

    return documentationExtensions.has(extension) ? "document" : "code";
  }

  private hashText(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private getProjectId(rootPath: string): string {
    return this.hashText(
      process.platform === "win32" ? rootPath.toLowerCase() : rootPath,
    ).slice(0, 24);
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error("Indexação RAG cancelada.");
      error.name = "AbortError";
      throw error;
    }
  }
}
