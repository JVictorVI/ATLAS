// Responsabilidade: renderiza busca, filtros e lista lateral de modelos.
function renderModelCard(model) {
  const active = state.selectedModel?.id === model.id ? "active" : "";
  const primaryFile = getModelFiles(model)[0];
  const kind = getModelKind(model);

  return `
    <button class="model-card ${active} ${escapeHtml(kind.className)}" type="button" data-model-id="${escapeHtml(model.id)}">
      <span class="model-badge">
        <i class="codicon codicon-${escapeHtml(kind.icon)}" aria-hidden="true"></i>
        ${escapeHtml(getModelBadge(model))}
      </span>
      <span class="model-card-info">
        <span class="model-card-name" title="${escapeHtml(model.id)}">${escapeHtml(model.name)}</span>
        <span class="model-card-meta">
          <span class="model-kind-pill"><i class="codicon codicon-${escapeHtml(kind.icon)}"></i> ${escapeHtml(kind.listTag)}</span>
          <span class="model-card-author"><i class="codicon codicon-code"></i> ${escapeHtml(model.author)}</span>
          <span class="model-card-variant">${escapeHtml(getVariantLabel(model, primaryFile))}</span>
        </span>
        <span class="model-card-footer">
          <span>Atualizado em ${escapeHtml(formatDate(model.updatedAt))}</span>
          <span><i class="codicon codicon-cloud-download"></i> ${escapeHtml(formatNumber(model.downloads))}</span>
          <span class="model-card-likes"><i class="codicon codicon-heart"></i> ${escapeHtml(formatNumber(model.likes))}</span>
          ${model.pipelineTag ? `<span><i class="codicon codicon-symbol-method"></i> ${escapeHtml(model.pipelineTag)}</span>` : ""}
          ${model.gated || model.private ? `<span><i class="codicon codicon-lock"></i> ${escapeHtml(getAccessLabel(model))}</span>` : ""}
        </span>
      </span>
    </button>
  `;
}

function renderSearchResultsInfo(visibleModels) {
  const resultLabel = state.loading
    ? renderLoadingCard(true)
    : state.error
      ? "ERRO AO PESQUISAR"
      : `${visibleModels.length} RESULTADOS ENCONTRADOS`;

  return `
    <div class="search-results-info">
      <i class="codicon codicon-chevron-right"></i>
      <span>${state.loading ? resultLabel : escapeHtml(resultLabel)}</span>
    </div>
  `;
}

function renderModelFilterButton(filter, label) {
  return `
    <button class="model-filter-button ${state.modelFilter === filter ? "active" : ""}" type="button" data-model-filter="${escapeHtml(filter)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderModelList(visibleModels) {
  if (state.loading) {
    return `<div class="model-list-loading"><div class="search-loading-card">${renderLoadingCard()}</div></div>`;
  }

  if (state.error) {
    return `
      <div class="search-error-state">
        <i class="codicon codicon-warning" aria-hidden="true"></i>
        <span>${escapeHtml(state.error)}</span>
        <button class="retry-search-button" id="retry-model-search" type="button">Tentar novamente</button>
      </div>
    `;
  }

  return (
    visibleModels.map(renderModelCard).join("") ||
    `<div class="model-list-empty">
      <i class="codicon codicon-search-stop" aria-hidden="true"></i>
      <strong>Nenhum resultado foi encontrado</strong>
      <span>Tente pesquisar usando outro nome ou termo.</span>
    </div>`
  );
}

function renderSidebar() {
  const visibleModels = getVisibleModels();

  return `
    <aside class="search-sidebar">
      <form class="search-input-wrapper" id="model-search-form">
        <input type="text" id="model-search" placeholder="Pesquisar..." value="${escapeHtml(state.query)}" />
        <button class="search-submit" type="submit" title="Pesquisar">
          <i class="codicon codicon-search"></i>
        </button>
      </form>
      <div class="model-filter-bar" aria-label="Filtro de tipo de modelo">
        ${renderModelFilterButton("all", "Ambos")}
        ${renderModelFilterButton("llm", "LLM")}
        ${renderModelFilterButton("embedding", "Embeddings")}
      </div>
      ${renderSearchResultsInfo(visibleModels)}
      <div class="model-list" id="model-list">
        ${renderModelList(visibleModels)}
      </div>
    </aside>
  `;
}
