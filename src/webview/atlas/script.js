const vscode = acquireVsCodeApi();

const runtimeCpu = document.getElementById("runtime-cpu");
const runtimeCuda = document.getElementById("runtime-cuda");
const runtimeVulkan = document.getElementById("runtime-vulkan");
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
  const runtimeType = ["cuda", "vulkan"].includes(value?.runtimeType)
    ? value.runtimeType
    : "cpu";

  if (runtimeCpu) {
    runtimeCpu.checked = runtimeType === "cpu";
  }

  if (runtimeCuda) {
    runtimeCuda.checked = runtimeType === "cuda";
  }

  if (runtimeVulkan) {
    runtimeVulkan.checked = runtimeType === "vulkan";
  }
}

function saveAtlasSettings() {
  vscode.postMessage({
    type: "salvarConfiguracoesAtlas",
    payload: {
      runtimeType: getSelectedRuntimeType(),
    },
  });
}

function getSelectedRuntimeType() {
  if (runtimeCuda?.checked) {
    return "cuda";
  }

  if (runtimeVulkan?.checked) {
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
