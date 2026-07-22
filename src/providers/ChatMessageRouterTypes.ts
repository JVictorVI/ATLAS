import * as vscode from "vscode";

import { ApiKeyManager } from "../managers/ApiKeyManager";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import { AtlasSessionService } from "../services/AtlasSessionService";
import { CloudApiService } from "../services/CloudApiService";
import { HuggingFaceModelSearchFilter } from "../services/HuggingFaceModelService";
import {
  HuggingFaceModelDetails,
  HuggingFaceModelSummary,
} from "../interfaces/HuggingFaceModelTypes";
import {
  RagContextResult,
  RagEmbeddingModelInfo,
  RagExternalDocument,
  RagExternalDocumentImportResult,
  RagIndexingOptions,
  RagIndexingProgress,
  RagProjectIndex,
  RagRuntimeStatus,
} from "../interfaces/AtlasRagTypes";

export type RouterDependencies = {
  apiKeyManager: ApiKeyManager;
  configManager: AtlasConfigManager;
  cloudApiService: CloudApiService;
  inferenceService: AtlasInferenceService;
  promptCustomizationService: AtlasPromptCustomizationService;
  promptAssemblyService: AtlasPromptAssemblyService;
  sessionService: AtlasSessionService;
  openPanel: (selectedView?: string) => void;
  openSearchModelDetails: (modelId: string) => void;
  sendModelsToWebview: (webview: vscode.Webview) => void;
  executeQuickAnalysis: (
    webview?: vscode.Webview,
    options?: {
      source?: "button" | "chat";
      sessionId?: string;
      signal?: AbortSignal;
    },
  ) => Promise<void>;
  cancelQuickAnalysis: () => void;
  clearQuickAnalysisDecorations: () => void;
  sendQuickAnalysisAvailability: (webview: vscode.Webview) => Promise<void>;
  refreshLocalModels: () => ReturnType<AtlasConfigManager["getLocalModels"]>;
  startLocalEngine: () => Promise<void>;
  promptStopLocalEngine: () => Promise<void>;
  stopLocalEngine: (options?: { force?: boolean }) => void;
  getLocalModelsDir: () => string;
  getLocalEnginesDir: () => string;
  searchHuggingFaceModels: (
    query: string,
    modelFilter?: HuggingFaceModelSearchFilter,
  ) => Promise<HuggingFaceModelSummary[]>;
  getHuggingFaceModelDetails: (
    modelId: string,
  ) => Promise<HuggingFaceModelDetails>;
  downloadHuggingFaceModel: (
    modelId: string,
    fileName: string,
    webview: vscode.Webview,
  ) => Promise<{ targetPath: string; format: "GGUF" | "ONNX" }>;
  refreshRagEmbeddingModels: () => RagEmbeddingModelInfo[];
  getRagEmbeddingModelsDir: () => string;
  downloadDefaultRagEmbeddingModel: (
    onProgress?: (progress: {
      fileName: string;
      processedFiles: number;
      totalFiles: number;
      skipped: boolean;
    }) => void,
    signal?: AbortSignal,
  ) => Promise<RagEmbeddingModelInfo>;
  deleteRagEmbeddingModel: (modelId: string) => RagEmbeddingModelInfo[];
  getChatEditorContext: () => AtlasEditorContext | null;
  buildEditorAnalysisContext: (context: AtlasEditorContext) => string;
  buildDocumentStructureContext: (
    document: vscode.TextDocument,
  ) => Promise<string>;
  isChatViewVisible: () => boolean;
  focusChatView: () => Promise<void>;
  initializeRag: () => Promise<RagRuntimeStatus>;
  getRagRuntimeStatus: () => RagRuntimeStatus;
  stopRag: () => void;
  listRagProjects: () => RagProjectIndex[];
  listExternalRagDocuments: () => RagExternalDocument[];
  addExternalRagDocuments: (
    uris: vscode.Uri[],
    onProgress?: (progress: {
      processedFiles: number;
      totalFiles: number;
      currentFile?: string;
    }) => void | Promise<void>,
    signal?: AbortSignal,
  ) => Promise<RagExternalDocumentImportResult>;
  deleteExternalRagDocument: (
    sourceId: string,
  ) => Promise<RagExternalDocument[]>;
  clearExternalRagDocuments: () => Promise<RagExternalDocument[]>;
  indexCurrentWorkspace: (
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
    options?: RagIndexingOptions,
  ) => Promise<RagProjectIndex>;
  indexSelectedFolder: (
    folderUri: vscode.Uri,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
    options?: RagIndexingOptions,
  ) => Promise<RagProjectIndex>;
  registerSelectedFolder: (folderUri: vscode.Uri) => RagProjectIndex;
  indexRagProject: (
    projectId: string,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
    options?: RagIndexingOptions,
  ) => Promise<RagProjectIndex>;
  deleteRagProject: (projectId: string) => Promise<void>;
  getRagContext: (
    query: string,
    signal?: AbortSignal,
  ) => Promise<RagContextResult>;
  markRagProjectsOutdated: (reason: string) => void;
};

export type ActiveResponseSnapshot = {
  controller: AbortController;
  sessionId: string;
  userContent: string;
  partialContent: string;
  isStreaming: boolean;
  interruptedSaved?: boolean;
  ragSources?: RagContextResult["sources"];
  generationId?: string;
  usesLocalEngine: boolean;
  forcedMode?: string;
};

export type ActiveGenerationPayload = {
  sessionId: string;
  userContent: string;
  partialContent: string;
  isStreaming: boolean;
  generationId?: string;
  forcedMode?: string;
} | null;
