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
  RagIndexManifest,
  RagIndexedSource,
  RagProjectIndex,
  RagSearchResult,
} from "../interfaces/AtlasRagTypes";
import { AtlasChromaService } from "../services/AtlasChromaService";

const MANIFEST_VERSION = "1.0.0";

type RagChunkMetadata = Metadata & {
  projectId: string;
  sourceId: string;
  relativePath: string;
  sourceType: "code" | "document";
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
    return this.loadManifest().projects.map((project) =>
      project.status === "indexing"
        ? {
            ...project,
            status: "outdated",
            errorMessage:
              "A indexação anterior foi interrompida antes da conclusão.",
          }
        : project,
    );
  }

  public getProject(projectId: string): RagProjectIndex | null {
    return (
      this.loadManifest().projects.find(
        (project) => project.projectId === projectId,
      ) ?? null
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

  public replaceProjectSources(
    projectId: string,
    sources: RagIndexedSource[],
  ): void {
    const manifest = this.loadManifest();
    manifest.sources = [
      ...manifest.sources.filter((source) => source.projectId !== projectId),
      ...sources,
    ];
    manifest.updatedAt = new Date().toISOString();
    this.saveManifest(manifest);
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
      await this.deleteCollection(project.collectionName);
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
