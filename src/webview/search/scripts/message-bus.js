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

function applyDownloadStatus(value) {
  const downloads = Array.isArray(value?.downloads)
    ? value.downloads
    : value?.downloading
      ? [{ modelId: value.modelId, fileName: value.fileName }]
      : [];

  state.downloads = downloads
    .map((download) => ({
      modelId: typeof download?.modelId === "string" ? download.modelId : "",
      fileName: typeof download?.fileName === "string" ? download.fileName : "",
    }))
    .filter((download) => download.modelId && download.fileName);
  state.downloading = state.downloads.length > 0;
  state.downloadingModelId = state.downloads[0]?.modelId || "";
  state.downloadingFileName = state.downloads[0]?.fileName || "";

  state.variantMenuOpen = false;
  render();
}

function clearDownloadStatus(value = {}) {
  const modelId = typeof value?.modelId === "string" ? value.modelId : "";
  const fileName = typeof value?.fileName === "string" ? value.fileName : "";

  if (modelId && fileName) {
    const completedKey = getDownloadKey(modelId, fileName);
    state.downloads = (Array.isArray(state.downloads) ? state.downloads : [])
      .filter(
        (download) =>
          getDownloadKey(download.modelId, download.fileName) !== completedKey,
      );
  } else {
    state.downloads = [];
  }

  state.downloading = state.downloads.length > 0;
  state.downloadingModelId = state.downloads[0]?.modelId || "";
  state.downloadingFileName = state.downloads[0]?.fileName || "";
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
