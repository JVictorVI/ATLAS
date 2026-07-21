// Responsabilidade: renderiza a busca de modelos compatíveis no Hugging Face.
const searchModelState = {
  query: "",
  models: [],
  selectedModelId: "",
  openedModelId: "",
  loading: false,
  error: "",
};

let searchDebounceTimer = undefined;

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
    return "ONNX";
  }

  const fromName = `${model.name} ${model.id}`.match(
    /(?:^|[-_\s])(\d+(?:\.\d+)?b)(?:[-_\s]|$)/i,
  );

  return fromName?.[1]?.toUpperCase() || "GGUF";
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
    query: searchModelState.query,
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
      openSearchModelDetails(modelId, { force: true });
    });
  });
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
        const description = getSearchModelDescription(model);

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
                <span><i class="codicon codicon-heart"></i> ${escapeHtml(formatSearchNumber(model.likes))}</span>
                ${model.pipelineTag ? `<span><i class="codicon codicon-symbol-method"></i> ${escapeHtml(model.pipelineTag)}</span>` : ""}
                ${model.gated || model.private ? `<span><i class="codicon codicon-lock"></i> ${escapeHtml(getSearchAccessLabel(model))}</span>` : ""}
              </span>
            </span>
          </button>
        `;
      })
      .join("") ||
    `<div class="model-list-empty">
      <i class="codicon codicon-search-stop" aria-hidden="true"></i>
      <strong>Nenhum resultado foi encontrado</strong>
      <span>Tente pesquisar usando outro nome ou termo.</span>
    </div>`;

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

  const previousSelectedModelId = searchModelState.selectedModelId;

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
  } else {
    openSearchModelDetails(searchModelState.selectedModelId);
  }
}
