const vscode = acquireVsCodeApi();

const engineCpu = document.getElementById("engine-cpu");
const engineCuda = document.getElementById("engine-cuda");
const engineVulkan = document.getElementById("engine-vulkan");
const engineStartOnOpen = document.getElementById("engine-start-on-open");
const modelsFolderPath = document.getElementById("models-folder-path");
const enginesFolderPath = document.getElementById("engines-folder-path");
const chooseModelsFolder = document.getElementById("choose-models-folder");
const chooseEnginesFolder = document.getElementById("choose-engines-folder");
const openModelsFolder = document.getElementById("open-models-folder");
const openEnginesFolder = document.getElementById("open-engines-folder");
const saveButton = document.getElementById("save-atlas-settings");

window.addEventListener("DOMContentLoaded", () => {
  saveButton?.addEventListener("click", saveAtlasSettings);
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

  if (engineStartOnOpen) {
    engineStartOnOpen.checked = value?.startOnAtlasOpen === true;
  }

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
      engineType: getSelectedEngineType(),
      startOnAtlasOpen: engineStartOnOpen?.checked === true,
      modelsDir: modelsFolderPath?.value || "",
      enginesDir: enginesFolderPath?.value || "",
    },
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
