export type RagIndexStatus =
  | "not-indexed"
  | "indexing"
  | "ready"
  | "outdated"
  | "error";

export interface RagProjectIndex {
  projectId: string;
  name: string;
  rootPath: string;
  collectionName: string;
  status: RagIndexStatus;
  embeddingModel: string;
  embeddingDimensions: number;
  sourceCount: number;
  chunkCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface RagIndexedSource {
  sourceId: string;
  projectId: string;
  type: "code" | "document";
  relativePath: string;
  language?: string;
  contentHash: string;
  sizeBytes: number;
  modifiedAt: string;
  chunkIds: string[];
}

export interface RagChunkRecord {
  chunkId: string;
  projectId: string;
  sourceId: string;
  content: string;
  embedding: number[];
  relativePath: string;
  sourceType: "code" | "document";
  externalDocument?: boolean;
  language?: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
  chunkIndex: number;
  contentHash: string;
}

export interface RagSearchResult {
  chunkId: string;
  sourceId: string;
  content: string;
  relativePath: string;
  sourceType: "code" | "document";
  externalDocument?: boolean;
  distance: number;
  language?: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
}

export interface RagContextSource {
  chunkId: string;
  relativePath: string;
  sourceType: "code" | "document";
  externalDocument?: boolean;
  distance: number;
  relevance: number;
  language?: string;
  startLine?: number;
  endLine?: number;
}

export interface RagContextResult {
  context: string[];
  sources: RagContextSource[];
}

export interface RagRuntimeStatus {
  available: boolean;
  running: boolean;
  host: string;
  port: number | null;
  dataPath: string;
  errorMessage?: string;
}

export interface RagIndexManifest {
  version: string;
  updatedAt: string;
  projects: RagProjectIndex[];
  sources: RagIndexedSource[];
}

export interface RagIndexingProgress {
  projectId: string;
  phase: "scanning" | "chunking" | "embedding" | "saving" | "completed";
  processedFiles: number;
  totalFiles: number;
  processedChunks: number;
  totalChunks: number;
  currentFile?: string;
}

export interface RagEmbeddingModelInfo {
  id: string;
  name: string;
  path: string;
  source: "bundled" | "custom";
  sizeBytes: number;
  sizeLabel: string;
  updatedAt: string;
  task?: string;
  dimensions?: number;
  quantization?: string;
  sourceModel?: string;
}
