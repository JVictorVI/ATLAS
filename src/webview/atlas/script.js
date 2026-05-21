const vscode = acquireVsCodeApi();

const engineCpu = document.getElementById("engine-cpu");
const engineCuda = document.getElementById("engine-cuda");
const engineVulkan = document.getElementById("engine-vulkan");
const engineStartOnOpen = document.getElementById("engine-start-on-open");
const saveButton = document.getElementById("save-atlas-settings");

window.addEventListener("DOMContentLoaded", () => {
  saveButton?.addEventListener("click", saveAtlasSettings);
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
}

function saveAtlasSettings() {
  vscode.postMessage({
    type: "salvarConfiguracoesAtlas",
    payload: {
      engineType: getSelectedEngineType(),
      startOnAtlasOpen: engineStartOnOpen?.checked === true,
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
