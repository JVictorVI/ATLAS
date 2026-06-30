const vscode = acquireVsCodeApi();

const atlasLanguage = document.getElementById("atlas-language");
const localStreamResponses = document.getElementById("local-stream-responses");
const engineCpu = document.getElementById("engine-cpu");
const engineCuda = document.getElementById("engine-cuda");
const engineVulkan = document.getElementById("engine-vulkan");
const contextWindowDynamic = document.getElementById("context-window-dynamic");
const contextWindowFixed = document.getElementById("context-window-fixed");
const engineStartOnOpen = document.getElementById("engine-start-on-open");
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
const saveButton = document.getElementById("save-atlas-settings");

window.addEventListener("DOMContentLoaded", () => {
  saveButton?.addEventListener("click", saveAtlasSettings);
  staticAnalysisEnabled?.addEventListener(
    "change",
    updateStaticAnalysisAvailability,
  );
  chooseModelsFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "selecionarPastaModelosLocais" });
  });
  chooseEnginesFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "selecionarPastaEnginesLocais" });
  });
  openModelsFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "openLocalModelsFolder" });
  });
  openEnginesFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPastaEnginesLocais" });
  });
  vscode.postMessage({ type: "carregarConfiguracoesAtlas" });
});

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "configuracoesAtlasCarregadas") {
    applyAtlasSettings(message.value);
  }

  if (message.type === "configuracoesAtlasSalvas") {
    applyAtlasSettings(message.value);
    showSavedFeedback();
  }
});

function applyAtlasSettings(value) {
  if (atlasLanguage) {
    atlasLanguage.value = value?.language === "en-US" ? "en-US" : "pt-BR";
  }

  if (localStreamResponses) {
    localStreamResponses.checked = value?.localStream !== false;
  }

  const engineType = ["cuda", "vulkan"].includes(value?.engineType)
    ? value.engineType
    : "cpu";

  if (engineCpu) {
    engineCpu.checked = engineType === "cpu";
  }

  if (engineCuda) {
    engineCuda.checked = engineType === "cuda";
  }

  if (engineVulkan) {
    engineVulkan.checked = engineType === "vulkan";
  }

  const dynamicContextWindow = value?.dynamicContextWindow !== false;

  if (contextWindowDynamic) {
    contextWindowDynamic.checked = dynamicContextWindow;
  }

  if (contextWindowFixed) {
    contextWindowFixed.checked = !dynamicContextWindow;
  }

  if (engineStartOnOpen) {
    engineStartOnOpen.checked = value?.startOnAtlasOpen === true;
  }

  if (staticAnalysisEnabled) {
    staticAnalysisEnabled.checked = value?.staticAnalysisEnabled !== false;
  }

  if (staticAnalysisQuick) {
    staticAnalysisQuick.checked = value?.staticAnalysisQuick !== false;
  }

  if (staticAnalysisArchitectural) {
    staticAnalysisArchitectural.checked =
      value?.staticAnalysisArchitectural !== false;
  }

  if (staticAnalysisDiagnostics) {
    staticAnalysisDiagnostics.checked =
      value?.staticAnalysisDiagnostics === true;
  }

  if (staticAnalysisRelations) {
    staticAnalysisRelations.checked =
      value?.staticAnalysisRelations === true;
  }

  updateStaticAnalysisAvailability();

  if (modelsFolderPath) {
    modelsFolderPath.value = value?.modelsDir || "";
    modelsFolderPath.title = value?.modelsDir || "";
  }

  if (enginesFolderPath) {
    enginesFolderPath.value = value?.enginesDir || "";
    enginesFolderPath.title = value?.enginesDir || "";
  }
}

function saveAtlasSettings() {
  vscode.postMessage({
    type: "salvarConfiguracoesAtlas",
    payload: {
      language: atlasLanguage?.value === "en-US" ? "en-US" : "pt-BR",
      localStream: localStreamResponses?.checked !== false,
      engineType: getSelectedEngineType(),
      dynamicContextWindow: contextWindowFixed?.checked !== true,
      startOnAtlasOpen: engineStartOnOpen?.checked === true,
      modelsDir: modelsFolderPath?.value || "",
      enginesDir: enginesFolderPath?.value || "",
      staticAnalysisEnabled: staticAnalysisEnabled?.checked === true,
      staticAnalysisQuick: staticAnalysisQuick?.checked === true,
      staticAnalysisArchitectural:
        staticAnalysisArchitectural?.checked === true,
      staticAnalysisDiagnostics: staticAnalysisDiagnostics?.checked === true,
      staticAnalysisRelations: staticAnalysisRelations?.checked === true,
    },
  });
}

function updateStaticAnalysisAvailability() {
  const enabled = staticAnalysisEnabled?.checked === true;

  if (staticAnalysisQuick) {
    staticAnalysisQuick.disabled = !enabled;
  }

  if (staticAnalysisArchitectural) {
    staticAnalysisArchitectural.disabled = !enabled;
  }

  if (staticAnalysisDiagnostics) {
    staticAnalysisDiagnostics.disabled = !enabled;
  }

  if (staticAnalysisRelations) {
    staticAnalysisRelations.disabled = !enabled;
  }

  document.querySelectorAll(".static-analysis-dependent").forEach((option) => {
    option.classList.toggle("is-disabled", !enabled);
  });
}

function getSelectedEngineType() {
  if (engineCuda?.checked) {
    return "cuda";
  }

  if (engineVulkan?.checked) {
    return "vulkan";
  }

  return "cpu";
}

function showSavedFeedback() {
  if (!saveButton) {
    return;
  }

  const originalText = saveButton.textContent;
  saveButton.textContent = "Salvo!";

  setTimeout(() => {
    saveButton.textContent = originalText;
  }, 1500);
}
