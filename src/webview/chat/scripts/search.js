// Responsabilidade: renderiza a busca de modelos compatíveis no Hugging Face.
const MODEL_FILTER_STORAGE_KEY = "atlas.huggingFaceModelFilter";
const SEARCH_REQUEST_TIMEOUT_MS = 35000;
const SEARCH_MODEL_LIST_PAGE_SIZE = 25;

function normalizeSearchModelFilter(value) {
  return value === "all" || value === "llm" || value === "embedding"
    ? value
    : "llm";
}

function getSavedSearchModelFilter() {
  try {
    return normalizeSearchModelFilter(
      window.localStorage.getItem(MODEL_FILTER_STORAGE_KEY),
    );
  } catch {
    return "llm";
  }
}

function saveSearchModelFilter(value) {
  try {
    window.localStorage.setItem(
      MODEL_FILTER_STORAGE_KEY,
      normalizeSearchModelFilter(value),
    );
  } catch {
    // localStorage can be unavailable in restricted webview contexts.
  }
}

const searchModelState = {
  query: "",
  models: [],
  modelFilter: getSavedSearchModelFilter(),
  currentPage: 1,
  hasNextPage: false,
  selectedModelId: "",
  openedModelId: "",
  loading: false,
  error: "",
};

let searchDebounceTimer = undefined;
let searchRequestTimer = undefined;
let searchRequestId = 0;

function getSearchErrorMessage(value) {
  if (typeof value === "string") {
    return value;
  }

  return (
    value?.message || "NÃ£o foi possÃ­vel buscar modelos no Hugging Face."
  );
}

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
  if (!searchModelState.loading) {
    return;
  }

  clearSearchRequestTimeout();
  searchModelState.loading = false;
  searchModelState.error = message;
  updateSearchResultsCount();
  renderSearchModelCards();
}

function formatSearchNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function getSearchFieldValue(value, fallback = "Nao informado") {
  return value === null || value === undefined || String(value).trim() === ""
    ? fallback
    : String(value).trim();
}

function formatSearchDate(value) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getSearchModelBadge(model) {
  if (model.format === "ONNX") {
    return "EMB";
  }

  return "LLM";
}

function getSearchModelKind(model) {
  return model.format === "ONNX"
    ? {
        className: "embedding-model",
        icon: "package",
        label: "EMBEDDING",
      }
    : {
        className: "generation-model",
        icon: "comment-discussion",
        label: "LLM",
      };
}

function prioritizeSearchGenerationModels(models) {
  return [...(models || [])].sort((left, right) => {
    const leftRank = left?.format === "ONNX" ? 1 : 0;
    const rightRank = right?.format === "ONNX" ? 1 : 0;

    return leftRank - rightRank;
  });
}

function matchesSearchModelFilter(model) {
  if (searchModelState.modelFilter === "llm") {
    return model?.format !== "ONNX";
  }

  if (searchModelState.modelFilter === "embedding") {
    return model?.format === "ONNX";
  }

  return true;
}

function getVisibleSearchModels() {
  return searchModelState.models.filter(matchesSearchModelFilter);
}

function clampSearchModelPage(page) {
  const parsedPage = Number.parseInt(page, 10);
  const safePage = Number.isFinite(parsedPage) ? parsedPage : 1;

  return Math.max(safePage, 1);
}

function getPaginatedSearchModels(models) {
  return models || [];
}

function getSearchModelPageRange(models) {
  const total = (models || []).length;

  if (!total) {
    return { start: 0, end: 0, total };
  }

  const start =
    (searchModelState.currentPage - 1) * SEARCH_MODEL_LIST_PAGE_SIZE + 1;
  const end = start + total - 1;

  return { start, end, total };
}

function getPrimarySearchFile(model) {
  return model.format === "ONNX"
    ? model.onnxFiles?.[0] || null
    : model.ggufFiles?.[0] || null;
}

function getSearchFileSizeLabel(file) {
  const size = file?.size || "";

  return size && !/tamanho n[aã]o informado/i.test(size) ? size : "";
}

function getSearchVariantLabel(model, file) {
  const count =
    model.format === "ONNX"
      ? model.onnxFiles?.length || 0
      : model.ggufFiles?.length || 0;
  const size = getSearchFileSizeLabel(file);

  return `${count} variante(s) ${size ? ` · ${size}` : ""}`;
}

function getSearchAccessLabel(model) {
  if (model.private) {
    return "Privado";
  }

  if (model.gated) {
    return "Gated";
  }

  return "Publico";
}

function getSearchModelDescription(model) {
  return getSearchFieldValue(model.description, "Nao informado");
}

function getSearchResultsLabel() {
  if (searchModelState.loading) {
    return "PESQUISANDO...";
  }

  if (searchModelState.error) {
    return "ERRO AO PESQUISAR";
  }

  const visibleModels = getVisibleSearchModels();
  const pageRange = getSearchModelPageRange(visibleModels);

  return visibleModels.length
    ? `${pageRange.start}-${pageRange.end} RESULTADOS`
    : "0 RESULTADOS ENCONTRADOS";
}

function requestSearchModels(query = searchModelState.query, page = 1) {
  searchModelState.query = query.trim();
  searchModelState.loading = true;
  searchModelState.error = "";
  searchModelState.currentPage = clampSearchModelPage(page);
  searchModelState.hasNextPage = false;
  searchModelState.selectedModelId = "";
  searchRequestId += 1;
  const requestId = String(searchRequestId);
  clearSearchRequestTimeout();
  searchRequestTimer = window.setTimeout(() => {
    if (requestId !== String(searchRequestId)) {
      return;
    }

    failSearchRequest(
      "A busca no Hugging Face demorou demais. Verifique sua conexÃ£o e tente novamente.",
    );
  }, SEARCH_REQUEST_TIMEOUT_MS);
  renderSearchModelCards();
  updateSearchResultsCount();

  vscode.postMessage({
    type: "buscarModelosHuggingFace",
    query: searchModelState.query,
    modelFilter: searchModelState.modelFilter,
    offset: (searchModelState.currentPage - 1) * SEARCH_MODEL_LIST_PAGE_SIZE,
    limit: SEARCH_MODEL_LIST_PAGE_SIZE,
    requestId,
  });
}

function scheduleSearchModels(query) {
  window.clearTimeout(searchDebounceTimer);

  searchDebounceTimer = window.setTimeout(() => {
    requestSearchModels(query);
  }, 350);
}

function bindSearchModelEvents() {
  const modelSearch = document.getElementById("model-search");

  if (modelSearch) {
    modelSearch.value = searchModelState.query;
    modelSearch.addEventListener("input", () => {
      searchModelState.query = modelSearch.value;
      scheduleSearchModels(modelSearch.value);
    });
  }

  document
    .getElementById("model-search-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      requestSearchModels(modelSearch?.value || "");
    });

  document.querySelectorAll(".model-filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-model-filter") || "all";

      searchModelState.modelFilter = normalizeSearchModelFilter(filter);
      saveSearchModelFilter(searchModelState.modelFilter);
      updateSearchFilterButtons();
      requestSearchModels(searchModelState.query);
    });
  });

  bindModelCardEvents();
}

function updateSearchFilterButtons() {
  document.querySelectorAll(".model-filter-button").forEach((button) => {
    const filter = button.getAttribute("data-model-filter") || "all";
    button.classList.toggle("active", filter === searchModelState.modelFilter);
  });
}

function bindModelCardEvents() {
  document.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      const modelId = card.getAttribute("data-id") || "";

      if (!modelId) {
        return;
      }

      searchModelState.selectedModelId = modelId;
      renderSearchModelCards();
      openSearchModelDetails(modelId, { force: true });
    });
  });
}

function bindSearchPaginationEvents() {
  document.querySelectorAll(".model-pagination-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.hasAttribute("disabled")) {
        return;
      }

      handleSearchPaginationAction(
        button.getAttribute("data-pagination-action"),
      );
    });
  });
}

function handleSearchPaginationAction(action) {
  const direction = action === "previous" ? -1 : action === "next" ? 1 : 0;

  if (!direction) {
    return;
  }

  searchModelState.currentPage = clampSearchModelPage(
    searchModelState.currentPage + direction,
  );

  document.getElementById("model-list")?.scrollTo({ top: 0 });
  requestSearchModels(searchModelState.query, searchModelState.currentPage);
}

function openSearchModelDetails(modelId, options = {}) {
  if (!modelId) {
    return;
  }

  if (!options.force && searchModelState.openedModelId === modelId) {
    return;
  }

  searchModelState.openedModelId = modelId;

  vscode.postMessage({
    type: "abrirDetalhesModelo",
    modelId,
  });
}

function renderSearchPaginationButton(action, icon, label, disabled) {
  return `
    <button class="model-pagination-button" type="button" data-pagination-action="${escapeHtml(action)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${disabled ? "disabled" : ""}>
      <i class="codicon codicon-${escapeHtml(icon)}" aria-hidden="true"></i>
    </button>
  `;
}

function renderSearchModelPagination() {
  if (
    searchModelState.loading ||
    searchModelState.error ||
    (!searchModelState.hasNextPage && searchModelState.currentPage <= 1)
  ) {
    return "";
  }

  const currentPage = clampSearchModelPage(searchModelState.currentPage);

  return `
    <div class="model-pagination" aria-label="Paginacao de modelos">
      ${renderSearchPaginationButton("previous", "chevron-left", "Pagina anterior", currentPage <= 1)}
      <span class="model-pagination-status">Pagina ${escapeHtml(currentPage)}</span>
      ${renderSearchPaginationButton("next", "chevron-right", "Proxima pagina", !searchModelState.hasNextPage)}
    </div>
  `;
}

function renderModelCards(
  models,
  activeModelId = searchModelState.selectedModelId,
) {
  const modelList = document.getElementById("model-list");

  if (!modelList) {
    return;
  }

  if (searchModelState.loading) {
    modelList.innerHTML =
      '<div class="model-list-loading"><div class="search-loading-card"><span class="search-loading-spinner" aria-hidden="true"></span></div></div>';
    return;
  }

  if (searchModelState.error) {
    modelList.innerHTML = `
      <div class="search-error-state">
        <i class="codicon codicon-warning" aria-hidden="true"></i>
        <span>${escapeHtml(searchModelState.error)}</span>
        <button class="retry-search-button" id="retry-model-search" type="button">Tentar novamente</button>
      </div>
    `;

    document
      .getElementById("retry-model-search")
      ?.addEventListener("click", () => {
        requestSearchModels(searchModelState.query, searchModelState.currentPage);
      });
    return;
  }

  const paginatedModels = getPaginatedSearchModels(models);
  const cardsHtml =
    paginatedModels
      .map((model) => {
        const primaryFile = getPrimarySearchFile(model);
        const active = model.id === activeModelId ? "active" : "";
        const description = getSearchModelDescription(model);
        const kind = getSearchModelKind(model);

        return `
          <button class="model-card ${active} ${escapeHtml(kind.className)}" type="button" data-id="${escapeHtml(model.id)}">
            <span class="model-badge">${escapeHtml(getSearchModelBadge(model))}</span>
              <span class="model-card-info">
                <span class="model-card-name" title="${escapeHtml(model.id)}">${escapeHtml(model.name)}</span>
              <span class="model-card-meta">
                <span class="model-kind-pill"><i class="codicon codicon-${escapeHtml(kind.icon)}"></i> ${escapeHtml(kind.label)}</span>
                <span class="model-card-author"><i class="codicon codicon-code"></i> ${escapeHtml(model.author)}</span>
                <span class="model-card-variant">${escapeHtml(getSearchVariantLabel(model, primaryFile))}</span>
              </span>
              <span class="model-card-footer">
                <span>Atualizado em ${escapeHtml(formatSearchDate(model.updatedAt))}</span>
                <span><i class="codicon codicon-cloud-download"></i> ${escapeHtml(formatSearchNumber(model.downloads))}</span>
                <span class="model-card-likes"><i class="codicon codicon-heart"></i> ${escapeHtml(formatSearchNumber(model.likes))}</span>
                ${model.pipelineTag ? `<span><i class="codicon codicon-symbol-method"></i> ${escapeHtml(model.pipelineTag)}</span>` : ""}
                ${model.gated || model.private ? `<span><i class="codicon codicon-lock"></i> ${escapeHtml(getSearchAccessLabel(model))}</span>` : ""}
              </span>
            </span>
          </button>
        `;
      })
      .join("");

  modelList.innerHTML =
    cardsHtml ||
    `<div class="model-list-empty">
      <i class="codicon codicon-search-stop" aria-hidden="true"></i>
      <strong>Nenhum resultado foi encontrado</strong>
      <span>Tente pesquisar usando outro nome ou termo.</span>
    </div>`;

  if (cardsHtml) {
    modelList.insertAdjacentHTML("beforeend", renderSearchModelPagination());
  }

  bindModelCardEvents();
  bindSearchPaginationEvents();
}

function renderSearchModelCards() {
  renderModelCards(getVisibleSearchModels());
}

function updateSearchResultsCount() {
  const countLabel = document.getElementById("search-results-count");

  if (countLabel) {
    countLabel.textContent = getSearchResultsLabel();
  }
}

function handleSearchModelsLoaded(payload) {
  if (currentView !== "search") {
    return;
  }

  if (!isCurrentSearchPayload(payload)) {
    return;
  }

  if (
    payload?.modelFilter &&
    payload.modelFilter !== searchModelState.modelFilter
  ) {
    return;
  }

  const previousSelectedModelId = searchModelState.selectedModelId;

  clearSearchRequestTimeout();
  searchModelState.loading = false;
  searchModelState.error = "";
  searchModelState.models = prioritizeSearchGenerationModels(payload?.models);
  searchModelState.currentPage =
    Math.floor(
      Number(payload?.pagination?.offset || 0) / SEARCH_MODEL_LIST_PAGE_SIZE,
    ) + 1;
  searchModelState.hasNextPage = Boolean(payload?.pagination?.hasNextPage);
  const visibleModels = getVisibleSearchModels();
  searchModelState.selectedModelId =
    searchModelState.selectedModelId &&
    visibleModels.some(
      (model) => model.id === searchModelState.selectedModelId,
    )
      ? searchModelState.selectedModelId
      : visibleModels[0]?.id || "";

  updateSearchResultsCount();
  updateSearchFilterButtons();
  renderSearchModelCards();

  if (
    searchModelState.selectedModelId &&
    searchModelState.selectedModelId !== previousSelectedModelId
  ) {
    openSearchModelDetails(searchModelState.selectedModelId);
  }
}

function handleSearchModelsError(message) {
  if (currentView !== "search") {
    return;
  }

  if (message?.source && message.source !== "huggingFaceSearch") {
    return;
  }

  if (!isCurrentSearchPayload(message)) {
    return;
  }

  failSearchRequest(getSearchErrorMessage(message));
  if (typeof message !== "string") {
    return;
  }

  searchModelState.loading = false;
  searchModelState.error =
    message || "Não foi possível buscar modelos no Hugging Face.";
  updateSearchResultsCount();
  renderSearchModelCards();
}

function renderSearchView() {
  currentView = "search";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <div class="search-layout">
      <aside class="search-sidebar">
        <form class="search-input-wrapper" id="model-search-form">
          <input type="text" id="model-search" placeholder="Pesquisar..." />
          <button class="search-submit" type="submit" title="Pesquisar">
            <i class="codicon codicon-search"></i>
          </button>
        </form>
        <div class="model-filter-bar" aria-label="Filtro de tipo de modelo">
          <button class="model-filter-button ${searchModelState.modelFilter === "all" ? "active" : ""}" type="button" data-model-filter="all">Ambos</button>
          <button class="model-filter-button ${searchModelState.modelFilter === "llm" ? "active" : ""}" type="button" data-model-filter="llm">LLM</button>
          <button class="model-filter-button ${searchModelState.modelFilter === "embedding" ? "active" : ""}" type="button" data-model-filter="embedding">Embeddings</button>
        </div>
        <div class="search-results-info">
          <i class="codicon codicon-chevron-right"></i>
          <span id="search-results-count">${escapeHtml(getSearchResultsLabel())}</span>
        </div>
        <div class="model-list" id="model-list"></div>
      </aside>
    </div>
  `;

  bindSearchModelEvents();
  renderSearchModelCards();

  if (searchModelState.models.length === 0 && !searchModelState.loading) {
    requestSearchModels("");
  } else {
    openSearchModelDetails(searchModelState.selectedModelId);
  }
}
