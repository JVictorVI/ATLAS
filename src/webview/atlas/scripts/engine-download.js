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

  if (engineDownloadPromptTitle) {
    engineDownloadPromptTitle.textContent = "Modo de execução alterado";
  }

  const selectedEngineType = getSelectedEngineType();
  renderEngineInstallInfo();
  const changed = selectedEngineType !== loadedEngineType;
  const knownDownloadState = engineDownloadStateByType[selectedEngineType];

  if (activeEngineDownloadType !== null) {
    engineDownloadPrompt.hidden = false;
    updateEngineDownloadActions(true, engineDownloadCancelRequested);

    if (engineDownloadPromptTitle) {
      engineDownloadPromptTitle.textContent =
        activeEngineOperation === "update"
          ? "Atualizando engine"
          : "Preparando engine";
    }

    if (engineDownloadPromptText) {
      engineDownloadPromptText.textContent =
        activeEngineOperation === "update"
          ? `A engine ${formatEngineType(activeEngineDownloadType)} está sendo atualizada. A versão anterior será mantida se a operação for cancelada.`
          : `A engine ${formatEngineType(activeEngineDownloadType)} está sendo baixada. O progresso continuará mesmo ao trocar de tela.`;
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
  applyEngineInstallInfo(engineType, value?.installInfo);
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
    activeEngineDownloadType !== null ||
    checkingEngineUpdates ||
    startingEngineUpdate
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
  applyEngineInstallInfo(engineType, value?.installInfo);
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
      deletingEngineType !== null ||
      activeEngineDownloadType !== null ||
      checkingEngineUpdates ||
      startingEngineUpdate;
    button.title = isDeleting
      ? `Excluindo engine ${formatEngineType(engineType)}...`
      : `Excluir engine ${formatEngineType(engineType)}`;
    button.setAttribute("aria-label", button.title);
  });

  updateEngineUpdateAction();
}

function applyEngineInstallInfo(engineType, value) {
  if (!atlasEngineTypes.includes(engineType)) {
    return;
  }

  engineInstallInfoByType[engineType] = {
    installed: value?.installed === true,
    releaseTag:
      typeof value?.releaseTag === "string" && value.releaseTag
        ? value.releaseTag
        : null,
    assetName:
      typeof value?.assetName === "string" && value.assetName
        ? value.assetName
        : null,
    installedAt:
      typeof value?.installedAt === "string" && value.installedAt
        ? value.installedAt
        : null,
  };
  renderEngineInstallInfo();
}

function renderEngineInstallInfo() {
  const selectedEngineType = getSelectedEngineType();

  engineVersionLabels.forEach((label) => {
    const engineType = label.dataset.engineVersion;
    const installInfo = engineInstallInfoByType[engineType];
    const downloaded = engineDownloadStateByType[engineType] === true;
    const managed = engineDeleteStateByType[engineType] === true;
    let text = "Não instalada";

    if (installInfo?.releaseTag) {
      text = installInfo.releaseTag;
    } else if (downloaded && !managed) {
      text = "Instalação personalizada";
    } else if (installInfo?.installed || downloaded) {
      text = "Versão desconhecida";
    }

    label.textContent = text;
    label.title = installInfo?.assetName || text;
    label.parentElement?.classList.toggle(
      "is-selected",
      engineType === selectedEngineType,
    );
  });
}

function downloadCurrentEngineMode() {
  if (
    checkingEngineUpdates ||
    startingEngineUpdate ||
    activeEngineDownloadType !== null
  ) {
    return;
  }

  downloadAfterSave = true;
  saveAtlasSettings();
  setEngineDownloadStatus("Salvando modo selecionado e preparando download...");
}

function checkCurrentEngineUpdate() {
  if (
    checkingEngineUpdates ||
    startingEngineUpdate ||
    activeEngineDownloadType !== null ||
    deletingEngineType !== null
  ) {
    return;
  }

  checkingEngineUpdates = true;
  engineUpdateAvailable = false;
  updateEngineDownloadActions(false, false);
  updateEngineDeleteButtons();

  if (getSelectedEngineType() === loadedEngineType) {
    updateCheckAfterSave = false;
    setEngineUpdateStatus("Procurando atualizações da engine...");
    vscode.postMessage({ type: "procurarAtualizacaoEngine" });
    return;
  }

  updateCheckAfterSave = true;
  setEngineUpdateStatus("Salvando o modo selecionado...");
  saveAtlasSettings();
}

function updateCurrentEngineNow() {
  if (
    !engineUpdateAvailable ||
    checkingEngineUpdates ||
    startingEngineUpdate ||
    activeEngineDownloadType !== null ||
    deletingEngineType !== null
  ) {
    return;
  }

  engineUpdateAvailable = false;
  startingEngineUpdate = true;
  setEngineUpdateStatus("Iniciando atualização da engine...");
  updateEngineDownloadActions(false, false);
  updateEngineDeleteButtons();
  vscode.postMessage({ type: "atualizarEngineAgora" });
}

function cancelCurrentEngineDownload() {
  if (activeEngineDownloadType === null || engineDownloadCancelRequested) {
    return;
  }

  engineDownloadCancelRequested = true;
  setEngineDownloadStatus(
    activeEngineOperation === "update"
      ? "Cancelando atualização..."
      : "Cancelando download...",
  );
  updateEngineDownloadActions(true, true);
  vscode.postMessage({ type: "cancelarDownloadEngineConfigurada" });
}

function updateEngineDownloadActions(loading, canceling) {
  engineTypeInputs.forEach((input) => {
    if (input) {
      input.disabled = loading || checkingEngineUpdates || startingEngineUpdate;
    }
  });

  if (downloadSelectedEngine) {
    downloadSelectedEngine.disabled =
      loading || checkingEngineUpdates || startingEngineUpdate;
    downloadSelectedEngine.textContent = loading
      ? activeEngineOperation === "update"
        ? "Atualizando..."
        : "Baixando..."
      : "Baixar";
  }

  if (cancelEngineDownload) {
    cancelEngineDownload.hidden = !loading;
    cancelEngineDownload.disabled = canceling;
    cancelEngineDownload.textContent = canceling ? "Cancelando..." : "Cancelar";
  }

  updateEngineUpdateAction();
}

function updateEngineUpdateAction() {
  if (!checkEngineUpdates) {
    return;
  }

  const disabled =
    checkingEngineUpdates ||
    startingEngineUpdate ||
    activeEngineDownloadType !== null ||
    deletingEngineType !== null;
  const label = checkEngineUpdates.querySelector("span");

  checkEngineUpdates.disabled = disabled;

  if (label) {
    label.textContent = checkingEngineUpdates
      ? "Procurando..."
      : "Procurar atualizações";
  }

  if (updateEngineNow) {
    updateEngineNow.hidden = !engineUpdateAvailable;
    updateEngineNow.disabled = disabled;
  }
}

function applyEngineUpdateStatus(value) {
  checkingEngineUpdates = value?.checking === true;
  startingEngineUpdate = false;
  engineUpdateAvailable = value?.updateAvailable === true;
  setEngineUpdateStatus(value?.message || "", value?.error === true);
  updateEngineDownloadActions(
    activeEngineDownloadType !== null,
    engineDownloadCancelRequested,
  );
  updateEngineDeleteButtons();
}

function setEngineUpdateStatus(message, isError = false) {
  if (!engineUpdateStatus) {
    return;
  }

  engineUpdateStatus.textContent = message;
  engineUpdateStatus.classList.toggle("is-error", isError);
}

function updateEngineDownloadStatus(value) {
  const selectedEngineType = getSelectedEngineType();
  const statusEngineType = atlasEngineTypes.includes(value?.engineType)
    ? value.engineType
    : selectedEngineType;

  if (value?.loading === true) {
    activeEngineOperation = value?.operation === "update" ? "update" : "download";

    if (activeEngineOperation === "update") {
      startingEngineUpdate = false;
      engineUpdateAvailable = false;
    }

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

  if (value?.loading === true) {
    updateEngineDownloadPrompt();
  }

  if (statusEngineType !== selectedEngineType) {
    setEngineDownloadStatus(
      activeEngineDownloadType !== null ? value?.message || "" : "",
    );
    updateEngineDownloadPrompt();
    return;
  }

  if (
    (value?.error === true || value?.canceled === true) &&
    value?.operation !== "update"
  ) {
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

  if (
    value?.done === true &&
    value?.error !== true &&
    value?.canceled !== true
  ) {
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
