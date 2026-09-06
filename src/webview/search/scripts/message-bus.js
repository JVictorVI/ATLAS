// Responsabilidade: traduz mensagens da extensao em atualizacoes de estado.
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "modelosHuggingFaceEncontrados") {
    handleModelsFound(message);
  }

  if (message.type === "modeloHuggingFaceDetalhado") {
    handleModelDetailed(message.value?.model);
  }

  if (message.type === "mostrarDetalhesModelo") {
    showModelDetails(message.modelId);
  }

  if (message.type === "hardwareRepositorioCarregado") {
    state.hardware = message.value || null;
    state.hardwareLoading = false;
    state.hardwareError = "";
    render();
  }

  if (message.type === "hardwareRepositorioErro") {
    state.hardware = null;
    state.hardwareLoading = false;
    state.hardwareError =
      typeof message.value === "string"
        ? message.value
        : "Nao foi possivel carregar o diagnostico de hardware.";
    render();
  }

  if (message.type === "statusDownloadModeloHuggingFace") {
    applyDownloadStatus(message.value);
  }

  if (message.type === "downloadModeloHuggingFaceConcluido") {
    clearDownloadStatus(message.value);
    render();
  }

  if (message.type === "erro") {
    handleSearchError(message.value);
  }
});

function handleModelsFound(message) {
  if (state.detailOnly || !isCurrentSearchPayload(message.value)) {
    return;
  }

  if (
    message.value?.modelFilter &&
    message.value.modelFilter !== state.modelFilter
  ) {
    return;
  }

  clearSearchRequestTimeout();
  state.loading = false;
  state.error = "";
  state.models = prioritizeGenerationModels(message.value?.models);
  state.currentPage =
    Math.floor(
      Number(message.value?.pagination?.offset || 0) / MODEL_LIST_PAGE_SIZE,
    ) + 1;
  state.hasNextPage = Boolean(message.value?.pagination?.hasNextPage);
  state.selectedModel = getVisibleModels()[0] || null;
  state.selectedFileName = getFirstModelFileName(state.selectedModel);
  state.variantMenuOpen = false;
  render();

  if (state.selectedModel) {
    requestModelDetails(state.selectedModel.id);
  }
}

function normalizeActiveDownloadEntry(download) {
  const modelId = typeof download?.modelId === "string" ? download.modelId : "";
  const fileName =
    typeof download?.fileName === "string" ? download.fileName : "";

  if (!modelId || !fileName) {
    return null;
  }

  const totalFiles = Number(download?.totalFiles);
  const fileIndex = Number(download?.fileIndex);
  const percent = Number(download?.percent);
  const downloadedBytes = Number(download?.downloadedBytes);
  const totalBytes = Number(download?.totalBytes);

  return {
    modelId,
    fileName,
    modelName:
      typeof download?.modelName === "string" && download.modelName
        ? download.modelName
        : fileName,
    format: download?.format === "ONNX" ? "ONNX" : "GGUF",
    state:
      download?.state === "preparando" ||
      download?.state === "baixando" ||
      download?.state === "cancelando"
        ? download.state
        : "baixando",
    percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0,
    downloadedBytes: Number.isFinite(downloadedBytes) ? downloadedBytes : 0,
    totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
    currentFileName:
      typeof download?.currentFileName === "string" && download.currentFileName
        ? download.currentFileName
        : fileName,
    fileIndex: Number.isFinite(fileIndex) && fileIndex > 0 ? fileIndex : 1,
    totalFiles: Number.isFinite(totalFiles) && totalFiles > 0 ? totalFiles : 1,
  };
}

function applyDownloadStatus(value) {
  const activeDownloads = (
    Array.isArray(value?.downloads) ? value.downloads : []
  )
    .map(normalizeActiveDownloadEntry)
    .filter(Boolean);
  const activeKeys = new Set(
    activeDownloads.map((download) =>
      getDownloadKey(download.modelId, download.fileName),
    ),
  );
  const finishedDownloads = (
    Array.isArray(state.downloads) ? state.downloads : []
  ).filter(
    (download) =>
      isTerminalDownloadState(download.state) &&
      !activeKeys.has(getDownloadKey(download.modelId, download.fileName)),
  );

  state.downloads = [...activeDownloads, ...finishedDownloads];
  state.downloading = activeDownloads.length > 0;
  state.downloadingModelId = activeDownloads[0]?.modelId || "";
  state.downloadingFileName = activeDownloads[0]?.fileName || "";

  state.variantMenuOpen = false;
  render();
}

function clearDownloadStatus(value = {}) {
  const modelId = typeof value?.modelId === "string" ? value.modelId : "";
  const fileName = typeof value?.fileName === "string" ? value.fileName : "";
  const finalState = value?.error
    ? "erro"
    : value?.canceled
      ? "cancelado"
      : "concluido";
  const downloads = Array.isArray(state.downloads) ? state.downloads : [];

  if (modelId && fileName) {
    const key = getDownloadKey(modelId, fileName);
    const existing = downloads.find(
      (download) => getDownloadKey(download.modelId, download.fileName) === key,
    );

    const finishedEntry = {
      ...(existing || {
        modelId,
        fileName,
        modelName: fileName,
        format: "GGUF",
        currentFileName: fileName,
        fileIndex: 1,
        totalFiles: 1,
      }),
      modelId,
      fileName,
      state: finalState,
      percent: finalState === "concluido" ? 100 : existing?.percent || 0,
      errorMessage: typeof value?.error === "string" ? value.error : "",
    };

    state.downloads = [
      ...downloads.filter(
        (download) =>
          getDownloadKey(download.modelId, download.fileName) !== key,
      ),
      finishedEntry,
    ];
  }

  const activeDownloads = state.downloads.filter(
    (download) => !isTerminalDownloadState(download.state),
  );
  state.downloading = activeDownloads.length > 0;
  state.downloadingModelId = activeDownloads[0]?.modelId || "";
  state.downloadingFileName = activeDownloads[0]?.fileName || "";
  state.variantMenuOpen = false;
}

function handleModelDetailed(detailed) {
  if (detailed) {
    state.selectedModel = detailed;
    state.selectedFileName =
      state.selectedFileName || getFirstModelFileName(detailed);
  }

  state.detailsLoading = false;
  state.detailsError = "";
  state.variantMenuOpen = false;
  render();
}

function handleSearchError(value) {
  if (value?.source && value.source !== "huggingFaceSearch") {
    return;
  }

  if (!isCurrentSearchPayload(value)) {
    return;
  }

  const messageText = getSearchErrorMessage(value);

  if (state.loading) {
    failSearchRequest(messageText);
  }

  if (state.detailsLoading) {
    state.detailsError = messageText;
  }

  state.detailsLoading = false;
  state.variantMenuOpen = false;
  render();
}
