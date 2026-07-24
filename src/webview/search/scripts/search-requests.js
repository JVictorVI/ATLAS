// Responsabilidade: dispara buscas/detalhes e protege respostas obsoletas.
function clearSearchRequestTimeout() {
  if (searchRequestTimer !== undefined) {
    window.clearTimeout(searchRequestTimer);
    searchRequestTimer = undefined;
  }
}

function isCurrentSearchPayload(payload) {
  const payloadRequestId =
    payload?.requestId === undefined || payload?.requestId === null
      ? ""
      : String(payload.requestId);

  return !payloadRequestId || payloadRequestId === String(searchRequestId);
}

function failSearchRequest(message) {
  if (!state.loading) {
    return;
  }

  clearSearchRequestTimeout();
  state.loading = false;
  state.error = message;
  render();
}

function requestModelDetails(modelId) {
  if (!modelId) {
    return;
  }

  state.detailsLoading = true;
  state.detailsError = "";
  state.variantMenuOpen = false;
  render();
  vscode.postMessage({ type: "detalharModeloHuggingFace", modelId });
}

function requestRepositoryHardware() {
  if (state.hardware || state.hardwareLoading) {
    return;
  }

  state.hardwareLoading = true;
  state.hardwareError = "";
  vscode.postMessage({ type: "solicitarHardwareRepositorio" });
}

function selectModel(model) {
  if (!model) {
    return;
  }

  state.selectedModel = model;
  state.selectedFileName = getFirstModelFileName(model);
  requestModelDetails(model.id);
}

function searchModels(query, page = 1) {
  state.query = query.trim();
  state.loading = true;
  state.currentPage = clampModelPage(page);
  state.hasNextPage = false;
  state.selectedModel = null;
  state.selectedFileName = "";
  state.variantMenuOpen = false;
  state.error = "";
  state.detailsError = "";
  searchRequestId += 1;
  const requestId = String(searchRequestId);

  clearSearchRequestTimeout();
  searchRequestTimer = window.setTimeout(() => {
    if (requestId !== String(searchRequestId)) {
      return;
    }

    failSearchRequest(
      "A busca no Hugging Face demorou demais. Verifique sua conexão e tente novamente.",
    );
  }, SEARCH_REQUEST_TIMEOUT_MS);

  render();
  vscode.postMessage({
    type: "buscarModelosHuggingFace",
    query: state.query,
    modelFilter: state.modelFilter,
    offset: (state.currentPage - 1) * MODEL_LIST_PAGE_SIZE,
    limit: MODEL_LIST_PAGE_SIZE,
    requestId,
  });
}

function showModelDetails(modelId) {
  if (!modelId) {
    return;
  }

  state.detailOnly = true;
  state.loading = false;
  state.selectedFileName = "";
  state.variantMenuOpen = false;
  state.detailsError = "";
  state.selectedModel = createPlaceholderModel(modelId);
  requestModelDetails(modelId);
}
