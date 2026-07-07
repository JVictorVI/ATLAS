// Responsabilidade: estado global do webview, referencias estaticas e setup do Markdown.
const vscode = acquireVsCodeApi();

const contentContainer = document.getElementById("content-container");
const chatgBtn = document.getElementById("chat-btn");
const libraryBtn = document.getElementById("library-btn");
const searchBtn = document.getElementById("search-btn");
const configBtn = document.getElementById("config-panel-btn");

let currentView = "chat";
let loadingElement = null;
let loadingDefaultMessage = "Pensando";
let mensagemAtualBot = null;
let bufferResposta = "";
let isLoadingCloudModels = false;
let cloudModelLoadError = null;
let isGeneratingResponse = false;
let shouldAutoScrollChat = true;

const CHAT_BOTTOM_THRESHOLD_PX = 72;

let fadeFramePending = false;

let shortcutLoadingState = {
  quickAnalysis: false,
  architectureAnalysis: false,
};
let hasEditorContextForAnalysis = false;

if (typeof marked !== "undefined") {
  marked.setOptions({
    gfm: true,
    breaks: true,
  });
}

let isStudyModeEnabled = false;

let modelsData = { local: { name: "Local", type: "local", models: [] } };
let isRefreshingModelCatalog = false;
let selectedMode = "local";
let selectedProvider = null;
let selectedModel = null;
let libraryHealth = null;
let libraryModels = [];
let isLocalEngineActionRunning = false;
let isLocalHealthLoading = false;
let localHealthLoadError = null;
let localHealthLoadingTimeout = undefined;

function notifyCurrentView() {
  vscode.postMessage({ type: "atualizarViewAtual", view: currentView });
}

function requestLatestLlmState() {
  isRefreshingModelCatalog = true;
  vscode.postMessage({ type: "carregarLLMs" });
}

let activeSessions = []; // AtlasSessionSummary[]
let activeSessionId = null; // string | null
let pendingSessionId = null;
let activeGenerationSessionId = null;
let activeGenerationId = null;
let generationSequence = 0;
const cancelledGenerationIds = new Set();

