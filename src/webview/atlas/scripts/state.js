// Responsabilidade: centraliza referencias do DOM e estado compartilhado da tela.
const vscode = acquireVsCodeApi();

const atlasSettingsPage = document.getElementById("atlas-settings-page");
const atlasLoading = document.getElementById("atlas-loading");
const atlasLanguage = document.getElementById("atlas-language");
const localStreamResponses = document.getElementById("local-stream-responses");
const saveInterruptedResponses = document.getElementById(
  "save-interrupted-responses",
);
const localEngineTimeout = document.getElementById("local-engine-timeout");
const contextProfileInputs = Array.from(
  document.querySelectorAll('input[name="context-profile"]'),
);
const engineCpu = document.getElementById("engine-cpu");
const engineCuda = document.getElementById("engine-cuda");
const engineVulkan = document.getElementById("engine-vulkan");
const contextWindowDynamic = document.getElementById("context-window-dynamic");
const contextWindowFixed = document.getElementById("context-window-fixed");
const engineStartOnOpen = document.getElementById("engine-start-on-open");
const enginePrepareOnOpen = document.getElementById("engine-prepare-on-open");
const engineDownloadPrompt = document.getElementById("engine-download-prompt");
const engineDownloadPromptText = document.getElementById(
  "engine-download-prompt-text",
);
const engineDownloadStatus = document.getElementById("engine-download-status");
const downloadSelectedEngine = document.getElementById(
  "download-selected-engine",
);
const staticAnalysisEnabled = document.getElementById(
  "static-analysis-enabled",
);
const staticAnalysisQuick = document.getElementById("static-analysis-quick");
const staticAnalysisArchitectural = document.getElementById(
  "static-analysis-architectural",
);
const staticAnalysisDiagnostics = document.getElementById(
  "static-analysis-diagnostics",
);
const staticAnalysisRelations = document.getElementById(
  "static-analysis-relations",
);
const modelsFolderPath = document.getElementById("models-folder-path");
const enginesFolderPath = document.getElementById("engines-folder-path");
const chooseModelsFolder = document.getElementById("choose-models-folder");
const chooseEnginesFolder = document.getElementById("choose-engines-folder");
const openModelsFolder = document.getElementById("open-models-folder");
const openEnginesFolder = document.getElementById("open-engines-folder");

const atlasEngineTypes = ["cpu", "cuda", "vulkan"];
const contextProfilePresetModes = ["light", "balanced", "advanced"];
const contextProfileModes = [...contextProfilePresetModes, "custom"];
const engineTypeInputs = [engineCpu, engineCuda, engineVulkan];
const staticAnalysisOptionInputs = [
  staticAnalysisQuick,
  staticAnalysisArchitectural,
  staticAnalysisDiagnostics,
  staticAnalysisRelations,
];
const atlasDirectAutosaveInputs = [
  atlasLanguage,
  localStreamResponses,
  saveInterruptedResponses,
  contextWindowDynamic,
  contextWindowFixed,
  engineStartOnOpen,
  enginePrepareOnOpen,
  ...staticAnalysisOptionInputs,
];

let initialAtlasSettingsLoaded = false;
let initialAtlasSettingsTimeout = undefined;
let loadedEngineType = "cpu";
let downloadAfterSave = false;
let atlasSettingsSaveTimeout = null;
let contextProfilePresets = {};

const engineDownloadStateByType = {};
