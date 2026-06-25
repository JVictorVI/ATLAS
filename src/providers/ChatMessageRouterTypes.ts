import * as vscode from "vscode";

import { ApiKeyManager } from "../managers/ApiKeyManager";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import { AtlasSessionService } from "../services/AtlasSessionService";
import { CloudApiService } from "../services/CloudApiService";
import {
  RagContextResult,
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
    options?: { source?: "button" | "chat"; sessionId?: string },
  ) => Promise<void>;
  clearQuickAnalysisDecorations: () => void;
  sendQuickAnalysisAvailability: (webview: vscode.Webview) => Promise<void>;
  refreshLocalModels: () => ReturnType<AtlasConfigManager["getLocalModels"]>;
  startLocalEngine: () => Promise<void>;
  promptStopLocalEngine: () => Promise<void>;
  stopLocalEngine: () => void;
  getLocalModelsDir: () => string;
  getLocalEnginesDir: () => string;
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
  indexCurrentWorkspace: (
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ) => Promise<RagProjectIndex>;
  indexSelectedFolder: (
    folderUri: vscode.Uri,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
  ) => Promise<RagProjectIndex>;
  registerSelectedFolder: (folderUri: vscode.Uri) => RagProjectIndex;
  indexRagProject: (
    projectId: string,
    onProgress?: (progress: RagIndexingProgress) => void | Promise<void>,
    signal?: AbortSignal,
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
};

export type ActiveGenerationPayload = {
  sessionId: string;
  userContent: string;
  partialContent: string;
  isStreaming: boolean;
} | null;
