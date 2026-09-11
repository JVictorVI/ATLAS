// Responsabilidade: centraliza referencias do DOM e estado compartilhado da tela.
const vscode = acquireVsCodeApi();

const atlasSettingsPage = document.getElementById("atlas-settings-page");
const atlasLoading = document.getElementById("atlas-loading");
const localStreamResponses = document.getElementById("local-stream-responses");
const saveInterruptedResponses = document.getElementById(
  "save-interrupted-responses",
);
const sideBarLocationInputs = Array.from(
  document.querySelectorAll('input[name="atlas-side-bar-location"]'),
);
const localEngineTimeout = document.getElementById("local-engine-timeout");
const contextProfileInputs = Array.from(
  document.querySelectorAll("input[data-context-profile-target]"),
);
const engineCpu = document.getElementById("engine-cpu");
const engineCuda = document.getElementById("engine-cuda");
const engineVulkan = document.getElementById("engine-vulkan");
const contextWindowDynamic = document.getElementById("context-window-dynamic");
const contextWindowFixed = document.getElementById("context-window-fixed");
const engineStartOnOpen = document.getElementById("engine-start-on-open");
const enginePrepareOnOpen = document.getElementById("engine-prepare-on-open");
const engineDownloadPrompt = document.getElementById("engine-download-prompt");
const engineDownloadPromptTitle = document.getElementById(
  "engine-download-prompt-title",
);
const engineDownloadPromptText = document.getElementById(
  "engine-download-prompt-text",
);
const engineDownloadStatus = document.getElementById("engine-download-status");
const downloadSelectedEngine = document.getElementById(
  "download-selected-engine",
);
const cancelEngineDownload = document.getElementById(
  "cancel-engine-download",
);
const checkEngineUpdates = document.getElementById("check-engine-updates");
const updateEngineNow = document.getElementById("update-engine-now");
const engineUpdateStatus = document.getElementById("engine-update-status");
const engineVersionLabels = Array.from(
  document.querySelectorAll("[data-engine-version]"),
);
const engineDeleteButtons = Array.from(
  document.querySelectorAll(".engine-delete-button"),
);
const refactoringEnabled = document.getElementById("refactoring-enabled");
const refactoringModelIntent = document.getElementById(
  "refactoring-model-intent",
);
const staticAnalysisEnabled = document.getElementById(
  "static-analysis-enabled",
);
const staticAnalysisQuick = document.getElementById("static-analysis-quick");
const staticAnalysisArchitectural = document.getElementById(
  "static-analysis-architectural",
);
const staticAnalysisRefactoring = document.getElementById(
  "static-analysis-refactoring",
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
const restoreAtlasDefaults = document.getElementById(
  "restore-atlas-defaults",
);

const atlasEngineTypes = ["cpu", "cuda", "vulkan"];
const contextProfilePresetModes = ["light", "balanced", "advanced"];
const contextProfileModes = [...contextProfilePresetModes, "custom"];
const contextProfileExecutionModes = ["local", "cloud"];
const engineTypeInputs = [engineCpu, engineCuda, engineVulkan];
const staticAnalysisOptionInputs = [
  staticAnalysisQuick,
  staticAnalysisArchitectural,
  staticAnalysisRefactoring,
  staticAnalysisDiagnostics,
  staticAnalysisRelations,
];
const contextProfileManagedInputs = [
  contextWindowDynamic,
  contextWindowFixed,
  staticAnalysisEnabled,
  ...staticAnalysisOptionInputs,
];
const atlasDirectAutosaveInputs = [
  localStreamResponses,
  saveInterruptedResponses,
  contextWindowDynamic,
  contextWindowFixed,
  engineStartOnOpen,
  enginePrepareOnOpen,
  refactoringEnabled,
  refactoringModelIntent,
  ...staticAnalysisOptionInputs,
];

let initialAtlasSettingsLoaded = false;
let initialAtlasSettingsTimeout = undefined;
let loadedEngineType = "cpu";
let downloadAfterSave = false;
let updateCheckAfterSave = false;
let atlasSettingsSaveTimeout = null;
let contextProfilePresets = {};
let contextProfilesByExecutionMode = {};
let customContextProfilesByExecutionMode = {};
let activeContextProfileTarget = "local";
let activeEngineDownloadType = null;
let activeEngineOperation = "download";
let engineDownloadCancelRequested = false;
let checkingEngineUpdates = false;
let engineUpdateAvailable = false;
let startingEngineUpdate = false;
let deletingEngineType = null;
let loadedEnginesDir = "";

const engineDownloadStateByType = {};
const engineDeleteStateByType = {};
const engineInstallInfoByType = {};
