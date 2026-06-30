import {
  ChromaClient,
  IncludeEnum,
  Metadata,
} from "chromadb";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  RagChunkRecord,
  RagExternalDocument,
  RagIndexManifest,
  RagIndexedSource,
  RagProjectIndex,
  RagSearchResult,
} from "../interfaces/AtlasRagTypes";
import { AtlasChromaService } from "../services/AtlasChromaService";

const MANIFEST_VERSION = "1.1.0";

type RagChunkMetadata = Metadata & {
  projectId: string;
  sourceId: string;
  relativePath: string;
  sourceType: "code" | "document";
  externalDocument?: boolean;
  chunkIndex: number;
  contentHash: string;
  language?: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
};

export class AtlasRagRepository {
  private readonly manifestPath: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly chromaService: AtlasChromaService,
  ) {
    this.manifestPath = path.join(
      this.context.globalStorageUri.fsPath,
      "rag",
      "index-manifest.json",
    );
  }

  public listProjects(): RagProjectIndex[] {
    return this.loadManifest().projects;
  }

  public listExternalDocuments(projectId?: string): RagExternalDocument[] {
    return this.loadManifest().sources
      .filter(
        (source) =>
          source.externalDocument === true &&
          (!projectId || source.projectId === projectId),
      )
      .map((source) => ({
        sourceId: source.sourceId,
        projectId: source.projectId,
        name: source.displayName || path.basename(source.relativePath),
        relativePath: source.relativePath,
        absolutePath: source.absolutePath ?? "",
        fileType: source.fileType ?? source.language ?? "document",
        sizeBytes: source.sizeBytes,
        modifiedAt: source.modifiedAt,
        chunkCount: source.chunkIds.length,
      }))
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  }

  public listExternalSources(
    projectId?: string,
    embeddingModel?: string,
  ): RagIndexedSource[] {
    return this.loadManifest().sources.filter(
      (source) =>
        source.externalDocument === true &&
        (!projectId || source.projectId === projectId) &&
        (!embeddingModel || source.embeddingModel === embeddingModel),
    );
  }

  public hasExternalDocuments(
    projectId: string,
    embeddingModel?: string,
  ): boolean {
    return this.loadManifest().sources.some(
      (source) =>
        source.projectId === projectId &&
        source.externalDocument === true &&
        (!embeddingModel || source.embeddingModel === embeddingModel),
    );
  }

  public normalizeInterruptedIndexes(): void {
    const manifest = this.loadManifest();
    let changed = false;
    const metadataUpgradeRequired = manifest.version !== MANIFEST_VERSION;

    manifest.projects = manifest.projects.map((project) => {
      if (project.status === "indexing") {
        changed = true;
        return {
          ...project,
          status: "outdated",
          updatedAt: new Date().toISOString(),
          errorMessage:
            "A indexação anterior foi interrompida antes da conclusão.",
        };
      }

      if (!metadataUpgradeRequired || project.status !== "ready") {
        return project;
      }

      changed = true;
      return {
        ...project,
        status: "outdated",
        updatedAt: new Date().toISOString(),
        errorMessage:
          "A estrutura de metadados do RAG foi atualizada; reindexe o projeto.",
      };
    });

    if (changed || metadataUpgradeRequired) {
      manifest.version = MANIFEST_VERSION;
      manifest.updatedAt = new Date().toISOString();
      this.saveManifest(manifest);
    }
  }

  public getProject(projectId: string): RagProjectIndex | null {
    return (
      this.loadManifest().projects.find(
        (project) => project.projectId === projectId,
      ) ?? null
    );
  }

  public getSource(sourceId: string): RagIndexedSource | null {
    return (
      this.loadManifest().sources.find((source) => source.sourceId === sourceId) ??
      null
    );
  }

  public saveProject(project: RagProjectIndex): void {
    const manifest = this.loadManifest();
    const index = manifest.projects.findIndex(
      (item) => item.projectId === project.projectId,
    );

    if (index === -1) {
      manifest.projects.unshift(project);
    } else {
      manifest.projects[index] = project;
    }

    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  public updateProjectStatus(
    projectId: string,
    status: RagProjectIndex["status"],
    errorMessage?: string,
  ): RagProjectIndex | null {
    const project = this.getProject(projectId);

    if (!project) {
      return null;
    }

    const updated: RagProjectIndex = {
      ...project,
      status,
      updatedAt: new Date().toISOString(),
      errorMessage,
    };
    this.saveProject(updated);
    return updated;
  }

  public replaceProjectSources(
    projectId: string,
    sources: RagIndexedSource[],
  ): void {
    const manifest = this.loadManifest();
    manifest.sources = [
      ...manifest.sources.filter(
        (source) =>
          source.projectId !== projectId || source.externalDocument === true,
      ),
      ...sources,
    ];
    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  public saveSources(sources: RagIndexedSource[]): void {
    if (sources.length === 0) {
      return;
    }

    const manifest = this.loadManifest();
    const byId = new Map(
      manifest.sources.map((source) => [source.sourceId, source]),
    );

    for (const source of sources) {
      byId.set(source.sourceId, source);
    }

    manifest.sources = Array.from(byId.values());
    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  public deleteSourceFromManifest(sourceId: string): RagIndexedSource | null {
    const manifest = this.loadManifest();
    const source =
      manifest.sources.find((item) => item.sourceId === sourceId) ?? null;

    if (!source) {
      return null;
    }

    manifest.sources = manifest.sources.filter(
      (item) => item.sourceId !== sourceId,
    );
    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
    return source;
  }

  public deleteExternalSourcesFromManifest(
    projectId: string,
  ): RagIndexedSource[] {
    const manifest = this.loadManifest();
    const deleted = manifest.sources.filter(
      (source) =>
        source.projectId === projectId && source.externalDocument === true,
    );

    if (deleted.length === 0) {
      return [];
    }

    manifest.sources = manifest.sources.filter(
      (source) =>
        source.projectId !== projectId || source.externalDocument !== true,
    );
    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
    return deleted;
  }

  public async upsertChunks(
    collectionName: string,
    chunks: RagChunkRecord[],
  ): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const collection = await this.getCollection(collectionName);

    await collection.upsert({
      ids: chunks.map((chunk) => chunk.chunkId),
      embeddings: chunks.map((chunk) => chunk.embedding),
      documents: chunks.map((chunk) => chunk.content),
      metadatas: chunks.map((chunk) => this.toMetadata(chunk)),
    });
  }

  public async search(
    collectionName: string,
    queryEmbedding: number[],
    topK: number,
  ): Promise<RagSearchResult[]> {
    const collection = await this.getCollection(collectionName);
    const result = await collection.query<RagChunkMetadata>({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: [
        IncludeEnum.documents,
        IncludeEnum.metadatas,
        IncludeEnum.distances,
      ],
    });
    const ids = result.ids[0] ?? [];
    const documents = result.documents?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];

    return ids.flatMap((chunkId, index) => {
      const metadata = metadatas[index];
      const content = documents[index];

      if (!metadata || content === null || content === undefined) {
        return [];
      }

      return [
        {
          chunkId,
          sourceId: String(metadata.sourceId),
          content,
          relativePath: String(metadata.relativePath),
          sourceType:
            metadata.sourceType === "document" ? "document" : "code",
          externalDocument: metadata.externalDocument === true,
          distance: Number(distances[index] ?? 0),
          language: this.optionalString(metadata.language),
          startLine: this.optionalNumber(metadata.startLine),
          endLine: this.optionalNumber(metadata.endLine),
          symbolName: this.optionalString(metadata.symbolName),
        },
      ];
    });
  }

  public async deleteSource(
    collectionName: string,
    sourceId: string,
  ): Promise<void> {
    const collection = await this.getCollection(collectionName);
    await collection.delete({
      where: { sourceId },
    });
  }

  public async deleteCollection(collectionName: string): Promise<void> {
    const client = await this.chromaService.ensureReady();

    try {
      await client.deleteCollection({ name: collectionName });
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  public async deleteProject(projectId: string): Promise<void> {
    const manifest = this.loadManifest();
    const project = manifest.projects.find(
      (item) => item.projectId === projectId,
    );

    if (project) {
      const externalCollections = new Set(
        manifest.sources
          .filter(
            (source) =>
              source.projectId === projectId &&
              source.externalDocument === true &&
              source.collectionName,
          )
          .map((source) => source.collectionName!),
      );
      await this.deleteCollection(project.collectionName);
      await this.deleteCollection(`${project.collectionName}_external`);

      for (const collectionName of externalCollections) {
        await this.deleteCollection(collectionName);
      }
    }

    manifest.projects = manifest.projects.filter(
      (item) => item.projectId !== projectId,
    );
    manifest.sources = manifest.sources.filter(
      (source) => source.projectId !== projectId,
    );
    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
  }

  public async replaceCollection(
    stagingCollectionName: string,
    targetCollectionName: string,
  ): Promise<void> {
    const client = await this.chromaService.ensureReady();
    const staging = await client.getCollection({
      name: stagingCollectionName,
    });

    await this.deleteCollection(targetCollectionName);
    await staging.modify({ name: targetCollectionName });
  }

  public async count(collectionName: string): Promise<number> {
    const collection = await this.getCollection(collectionName);
    return collection.count();
  }

  private async getCollection(collectionName: string) {
    const client: ChromaClient = await this.chromaService.ensureReady();
    return client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: null,
      metadata: {
        "hnsw:space": "cosine",
        atlasManaged: true,
      },
    });
  }

  private toMetadata(chunk: RagChunkRecord): RagChunkMetadata {
    const metadata: RagChunkMetadata = {
      projectId: chunk.projectId,
      sourceId: chunk.sourceId,
      relativePath: chunk.relativePath,
      sourceType: chunk.sourceType,
      externalDocument: chunk.externalDocument === true,
      chunkIndex: chunk.chunkIndex,
      contentHash: chunk.contentHash,
    };

    if (chunk.language) {
      metadata.language = chunk.language;
    }

    if (chunk.startLine !== undefined) {
      metadata.startLine = chunk.startLine;
    }

    if (chunk.endLine !== undefined) {
      metadata.endLine = chunk.endLine;
    }

    if (chunk.symbolName) {
      metadata.symbolName = chunk.symbolName;
    }

    return metadata;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name.includes("NotFound") ||
        error.message.toLowerCase().includes("not found"))
    );
  }

  private loadManifest(): RagIndexManifest {
    if (!fs.existsSync(this.manifestPath)) {
      return this.createEmptyManifest();
    }

    try {
      const raw = fs.readFileSync(this.manifestPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RagIndexManifest>;

      return {
        version: parsed.version ?? MANIFEST_VERSION,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    } catch {
      return this.createEmptyManifest();
    }
  }

  private saveManifest(manifest: RagIndexManifest): void {
    const directory = path.dirname(this.manifestPath);
    fs.mkdirSync(directory, { recursive: true });

    const temporaryPath = `${this.manifestPath}.tmp`;
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
    fs.renameSync(temporaryPath, this.manifestPath);
  }

  private createEmptyManifest(): RagIndexManifest {
    return {
      version: MANIFEST_VERSION,
      updatedAt: new Date().toISOString(),
      projects: [],
      sources: [],
    };
  }
}
