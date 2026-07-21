// Responsabilidade: renderiza a busca funcional de modelos GGUF no Hugging Face.
const searchModelState = {
  query: "",
  models: [],
  selectedModelId: "",
  loading: false,
  error: "",
};

let searchDebounceTimer = undefined;

function formatSearchNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
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
  const fromName = `${model.name} ${model.id}`.match(
    /(?:^|[-_\s])(\d+(?:\.\d+)?b)(?:[-_\s]|$)/i,
  );

  return fromName?.[1]?.toUpperCase() || "GGUF";
}

function getPrimarySearchFile(model) {
  return model.ggufFiles?.[0] || null;
}

function getSearchFileSizeLabel(file) {
  const size = file?.size || "";

  return size && !/tamanho n[aã]o informado/i.test(size) ? size : "";
}

function getSearchVariantLabel(model, file) {
  const count = model.ggufFiles?.length || 0;
  const size = getSearchFileSizeLabel(file);

  return `${count} variante(s) ${size ? ` · ${size}` : ""}`;
}

function getSearchResultsLabel() {
  if (searchModelState.loading) {
    return "PESQUISANDO...";
  }

  if (searchModelState.error) {
    return "ERRO AO PESQUISAR";
  }

  return `${searchModelState.models.length} RESULTADOS ENCONTRADOS`;
}

function requestSearchModels(query = searchModelState.query) {
  searchModelState.query = query.trim();
  searchModelState.loading = true;
  searchModelState.error = "";
  renderSearchModelCards();
  updateSearchResultsCount();

  vscode.postMessage({
    type: "buscarModelosHuggingFace",
    query: searchModelState.query || "gguf",
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

  bindModelCardEvents();
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

      vscode.postMessage({
        type: "abrirDetalhesModelo",
        modelId,
      });
    });
  });
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
        requestSearchModels(searchModelState.query);
      });
    return;
  }

  modelList.innerHTML =
    models
      .map((model) => {
        const primaryFile = getPrimarySearchFile(model);
        const active = model.id === activeModelId ? "active" : "";

        return `
          <button class="model-card ${active}" type="button" data-id="${escapeHtml(model.id)}">
            <span class="model-badge">${escapeHtml(getSearchModelBadge(model))}</span>
              <span class="model-card-info">
                <span class="model-card-name" title="${escapeHtml(model.id)}">${escapeHtml(model.name)}</span>
              <span class="model-card-meta">
                <span class="model-card-author"><i class="codicon codicon-code"></i> ${escapeHtml(model.author)}</span>
                <span class="model-card-variant">${escapeHtml(getSearchVariantLabel(model, primaryFile))}</span>
              </span>
              <span class="model-card-footer">
                <span>Atualizado em ${escapeHtml(formatSearchDate(model.updatedAt))}</span>
                <span><i class="codicon codicon-cloud-download"></i> ${escapeHtml(formatSearchNumber(model.downloads))}</span>
              </span>
            </span>
          </button>
        `;
      })
      .join("") ||
    '<div class="model-list-empty">Nenhum resultado foi encontrado</div>';

  bindModelCardEvents();
}

function renderSearchModelCards() {
  renderModelCards(searchModelState.models);
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

  searchModelState.loading = false;
  searchModelState.error = "";
  searchModelState.models = payload?.models || [];
  searchModelState.selectedModelId =
    searchModelState.selectedModelId &&
    searchModelState.models.some(
      (model) => model.id === searchModelState.selectedModelId,
    )
      ? searchModelState.selectedModelId
      : searchModelState.models[0]?.id || "";

  updateSearchResultsCount();
  renderSearchModelCards();
}

function handleSearchModelsError(message) {
  if (currentView !== "search") {
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
  }
}
