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

  if (activeEngineDownloadType !== null) {
    engineDownloadPrompt.hidden = false;
    updateEngineDownloadActions(true, engineDownloadCancelRequested);

    if (engineDownloadPromptText) {
      engineDownloadPromptText.textContent = `A engine ${formatEngineType(activeEngineDownloadType)} está sendo baixada. O progresso continuará mesmo ao trocar de tela.`;
    }
    return;
  }

  updateEngineDownloadActions(false, false);

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
  engineDeleteStateByType[engineType] = value?.deletable === true;
  updateEngineDeleteButtons();

  if (engineType === getSelectedEngineType()) {
    updateEngineDownloadPrompt();
  }
}

function requestEngineModeDeletion(engineType) {
  if (
    !atlasEngineTypes.includes(engineType) ||
    engineDeleteStateByType[engineType] !== true ||
    deletingEngineType !== null ||
    activeEngineDownloadType !== null
  ) {
    return;
  }

  deletingEngineType = engineType;
  updateEngineDeleteButtons();
  vscode.postMessage({
    type: "excluirEngineModoExecucao",
    engineType,
  });
}

function applyEngineModeDeletionResult(value) {
  const engineType = value?.engineType;

  if (!atlasEngineTypes.includes(engineType)) {
    return;
  }

  deletingEngineType = null;
  engineDownloadStateByType[engineType] = value?.downloaded === true;
  engineDeleteStateByType[engineType] = value?.deletable === true;
  updateEngineDeleteButtons();

  if (engineType === getSelectedEngineType()) {
    updateEngineDownloadPrompt();
  }
}

function updateEngineDeleteButtons() {
  engineDeleteButtons.forEach((button) => {
    const engineType = button.dataset.engineType;
    const isDeleting = deletingEngineType === engineType;

    button.hidden = engineDeleteStateByType[engineType] !== true;
    button.disabled =
      deletingEngineType !== null || activeEngineDownloadType !== null;
    button.title = isDeleting
      ? `Excluindo engine ${formatEngineType(engineType)}...`
      : `Excluir engine ${formatEngineType(engineType)}`;
    button.setAttribute("aria-label", button.title);
  });
}

function downloadCurrentEngineMode() {
  downloadAfterSave = true;
  saveAtlasSettings();
  setEngineDownloadStatus("Salvando modo selecionado e preparando download...");
}

function cancelCurrentEngineDownload() {
  if (activeEngineDownloadType === null || engineDownloadCancelRequested) {
    return;
  }

  engineDownloadCancelRequested = true;
  setEngineDownloadStatus("Cancelando download...");
  updateEngineDownloadActions(true, true);
  vscode.postMessage({ type: "cancelarDownloadEngineConfigurada" });
}

function updateEngineDownloadActions(loading, canceling) {
  engineTypeInputs.forEach((input) => {
    if (input) {
      input.disabled = loading;
    }
  });

  if (downloadSelectedEngine) {
    downloadSelectedEngine.disabled = loading;
    downloadSelectedEngine.textContent = loading ? "Baixando..." : "Baixar";
  }

  if (cancelEngineDownload) {
    cancelEngineDownload.hidden = !loading;
    cancelEngineDownload.disabled = canceling;
    cancelEngineDownload.textContent = canceling ? "Cancelando..." : "Cancelar";
  }
}

function updateEngineDownloadStatus(value) {
  const selectedEngineType = getSelectedEngineType();
  const statusEngineType = atlasEngineTypes.includes(value?.engineType)
    ? value.engineType
    : selectedEngineType;

  if (value?.loading === true) {
    if (activeEngineDownloadType !== statusEngineType) {
      engineDownloadCancelRequested = false;
    }

    activeEngineDownloadType = statusEngineType;
    if (value?.canceling === true) {
      engineDownloadCancelRequested = true;
    }
  } else if (activeEngineDownloadType === statusEngineType) {
    activeEngineDownloadType = null;
    engineDownloadCancelRequested = false;
  }

  updateEngineDownloadActions(
    activeEngineDownloadType !== null,
    engineDownloadCancelRequested,
  );
  updateEngineDeleteButtons();

  if (statusEngineType !== selectedEngineType) {
    setEngineDownloadStatus(
      activeEngineDownloadType !== null ? value?.message || "" : "",
    );
    updateEngineDownloadPrompt();
    return;
  }

  if (value?.error === true || value?.canceled === true) {
    engineDownloadStateByType[statusEngineType] = false;
  }

  if (
    (value?.loading === true || value?.error === true) &&
    engineDownloadPrompt
  ) {
    engineDownloadPrompt.hidden = false;
  }

  const message = value?.message || "";
  setEngineDownloadStatus(message, value?.error === true);

  if (chooseEnginesFolder) {
    chooseEnginesFolder.disabled = value?.loading === true;
  }

  if (value?.done === true && value?.error !== true) {
    engineDownloadStateByType[statusEngineType] = true;
    loadedEngineType = statusEngineType;
    requestEngineModeCheck(statusEngineType);
    updateEngineDownloadPrompt();
  } else if (value?.done === true) {
    requestEngineModeCheck(statusEngineType);
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
