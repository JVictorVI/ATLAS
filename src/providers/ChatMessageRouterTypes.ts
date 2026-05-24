import * as vscode from "vscode";

import { ApiKeyManager } from "../managers/ApiKeyManager";
import { AtlasConfigManager } from "../managers/AtlasConfigManager";
import { AtlasEditorContext } from "../interfaces/AtlasEditorTypes";
import { AtlasPromptAssemblyService } from "../prompt/AtlasPromptAssemblyService";
import { AtlasPromptCustomizationService } from "../prompt/AtlasPromptCustomizationService";
import { AtlasInferenceService } from "../services/AtlasInferenceService";
import { AtlasSessionService } from "../services/AtlasSessionService";
import { CloudApiService } from "../services/CloudApiService";

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
  executeQuickAnalysis: (webview?: vscode.Webview) => Promise<void>;
  refreshLocalModels: () => ReturnType<AtlasConfigManager["getLocalModels"]>;
  promptStopLocalEngine: () => Promise<void>;
  stopLocalEngine: () => void;
  getLocalModelsDir: () => string;
  getChatEditorContext: () => AtlasEditorContext | null;
  buildEditorAnalysisContext: (context: AtlasEditorContext) => string;
  isChatViewVisible: () => boolean;
  focusChatView: () => Promise<void>;
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
