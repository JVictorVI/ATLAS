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
    clearDownloadStatus();
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
  state.downloading = Boolean(value?.downloading);
  state.downloadingModelId =
    typeof value?.modelId === "string" ? value.modelId : "";
  state.downloadingFileName =
    typeof value?.fileName === "string" ? value.fileName : "";

  if (
    state.downloading &&
    state.selectedModel?.id === state.downloadingModelId &&
    state.downloadingFileName
  ) {
    state.selectedFileName = state.downloadingFileName;
  }

  state.variantMenuOpen = false;
  render();
}

function clearDownloadStatus() {
  state.downloading = false;
  state.downloadingModelId = "";
  state.downloadingFileName = "";
  state.variantMenuOpen = false;
}

function handleModelDetailed(detailed) {
  if (detailed) {
    state.selectedModel = detailed;
    state.selectedFileName =
      state.downloading &&
      detailed.id === state.downloadingModelId &&
      state.downloadingFileName
        ? state.downloadingFileName
        : state.selectedFileName || getFirstModelFileName(detailed);
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
  clearDownloadStatus();
  state.variantMenuOpen = false;
  render();
}
