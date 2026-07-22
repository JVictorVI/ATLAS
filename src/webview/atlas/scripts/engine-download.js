// Responsabilidade: gerencia modo de execucao local e download da engine.
function normalizeEngineType(engineType) {
  return atlasEngineTypes.includes(engineType) ? engineType : "cpu";
}

function setEngineType(engineType) {
  const normalized = normalizeEngineType(engineType);

  setChecked(engineCpu, normalized === "cpu");
  setChecked(engineCuda, normalized === "cuda");
  setChecked(engineVulkan, normalized === "vulkan");
}

function getSelectedEngineType() {
  const selected = engineTypeInputs.find((input) => input?.checked);
  return normalizeEngineType(selected?.value);
}

function updateEngineDownloadPrompt() {
  if (!engineDownloadPrompt) {
    return;
  }

  const selectedEngineType = getSelectedEngineType();
  const changed = selectedEngineType !== loadedEngineType;
  const knownDownloadState = engineDownloadStateByType[selectedEngineType];

  if (knownDownloadState === true) {
    engineDownloadPrompt.hidden = true;
    setEngineDownloadStatus("");
    return;
  }

  if (knownDownloadState !== false) {
    engineDownloadPrompt.hidden = true;
    requestEngineModeCheck(selectedEngineType);
    return;
  }

  engineDownloadPrompt.hidden = false;

  if (engineDownloadPromptText) {
    engineDownloadPromptText.textContent = changed
      ? `O modo mudou de ${formatEngineType(loadedEngineType)} para ${formatEngineType(selectedEngineType)}. O ATLAS salvará automaticamente; baixe a engine correspondente agora.`
      : `A engine ${formatEngineType(selectedEngineType)} ainda não está instalada. Baixe agora para deixar o ATLAS pronto para usar.`;
  }
}

function requestEngineModeCheck(engineType) {
  vscode.postMessage({
    type: "verificarEngineModoExecucao",
    engineType,
  });
}

function applyEngineModeCheck(value) {
  const engineType = value?.engineType;

  if (!atlasEngineTypes.includes(engineType)) {
    return;
  }

  engineDownloadStateByType[engineType] = value?.downloaded === true;

  if (engineType === getSelectedEngineType()) {
    updateEngineDownloadPrompt();
  }
}

function downloadCurrentEngineMode() {
  downloadAfterSave = true;
  saveAtlasSettings();
  setEngineDownloadStatus("Salvando modo selecionado e preparando download...");
}

function updateEngineDownloadStatus(value) {
  const message = value?.message || "";
  setEngineDownloadStatus(message, value?.error === true);

  if (downloadSelectedEngine) {
    downloadSelectedEngine.disabled = value?.loading === true;
    downloadSelectedEngine.textContent =
      value?.loading === true ? "Baixando..." : "Baixar agora";
  }

  if (value?.done === true && value?.error !== true) {
    const selectedEngineType = getSelectedEngineType();
    engineDownloadStateByType[selectedEngineType] = true;
    loadedEngineType = selectedEngineType;
    updateEngineDownloadPrompt();
  }
}

function setEngineDownloadStatus(message, isError = false) {
  if (!engineDownloadStatus) {
    return;
  }

  engineDownloadStatus.textContent = message;
  engineDownloadStatus.classList.toggle("is-error", isError);
}

function formatEngineType(engineType) {
  if (engineType === "cuda") {
    return "GPU NVIDIA CUDA";
  }

  if (engineType === "vulkan") {
    return "GPU Vulkan";
  }

  return "CPU";
}
