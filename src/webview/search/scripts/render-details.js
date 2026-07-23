// Responsabilidade: renderiza painel de detalhes, variantes e acoes do modelo.
function renderDetailEmpty() {
  return `
    ${renderPageHeading()}
    <section class="empty-detail">
      <i class="codicon codicon-package"></i>
      <h2>Selecione um modelo compatível</h2>
      <p>Os detalhes e arquivos disponíveis aparecem aqui.</p>
    </section>
  `;
}

function renderVariantOptions(model, selectedFile) {
  return getModelFiles(model)
    .map(
      (file) => `
        <button class="variant-option ${file.name === selectedFile?.name ? "selected" : ""}" type="button" data-file-name="${escapeHtml(file.name)}" role="option" aria-selected="${file.name === selectedFile?.name ? "true" : "false"}">
          <span class="variant-option-main">${escapeHtml(file.quantization)}</span>
          ${getFileSizeLabel(file) ? `<span class="variant-option-size">${escapeHtml(getFileSizeLabel(file))}</span>` : ""}
          <span class="variant-option-name">${escapeHtml(file.name)}</span>
        </button>
      `,
    )
    .join("");
}

function renderVariantSelectOptions(model, selectedFile) {
  return getModelFiles(model)
    .map(
      (file) => `
        <option value="${escapeHtml(file.name)}" ${file.name === selectedFile?.name ? "selected" : ""}>
          ${escapeHtml(getVariantOptionLabel(file))}
        </option>
      `,
    )
    .join("");
}

function renderDetailActions(model, selectedFile, huggingFaceModelUrl) {
  return `
    <div class="detail-actions">
      <button class="download-button" id="download-model" type="button" ${!selectedFile || state.downloading ? "disabled" : ""}>
        <i class="codicon codicon-arrow-down"></i>
        ${escapeHtml(getDownloadLabel(model, selectedFile))}
      </button>
      <div class="variant-picker ${state.variantMenuOpen ? "open" : ""}" title="${escapeHtml(selectedFile?.name || "Selecionar arquivo")}">
        <button class="variant-picker-trigger" id="gguf-variant-trigger" type="button" ${state.downloading || !selectedFile ? "disabled" : ""} aria-expanded="${state.variantMenuOpen ? "true" : "false"}">
          <i class="codicon codicon-versions variant-leading-icon"></i>
          <span class="variant-selected-label">${escapeHtml(selectedFile ? getVariantOptionLabel(selectedFile) : "Selecionar arquivo")}</span>
          <i class="codicon codicon-chevron-down variant-chevron-icon"></i>
        </button>
        ${
          state.variantMenuOpen
            ? `<div class="variant-options" role="listbox">
                ${renderVariantOptions(model, selectedFile)}
              </div>`
            : ""
        }
      </div>
      <label class="variant-select" title="${escapeHtml(selectedFile?.name || "Selecionar arquivo")}">
        <i class="codicon codicon-versions variant-leading-icon"></i>
        <select id="gguf-variant-select" ${state.downloading ? "disabled" : ""}>
          ${renderVariantSelectOptions(model, selectedFile)}
        </select>
        <i class="codicon codicon-chevron-down variant-chevron-icon"></i>
      </label>
      <button class="icon-button" id="open-huggingface-file" type="button" title="Abrir modelo no Hugging Face" ${!huggingFaceModelUrl ? "disabled" : ""}>
        <i class="codicon codicon-link-external"></i>
      </button>
    </div>
  `;
}

function renderCompatibilityDiagnostics(model, selectedFile) {
  const diagnostics = window.AtlasCompatibilityDiagnostics;

  if (!diagnostics?.renderCompatibilityDiagnosticsCard) {
    return "";
  }

  return diagnostics.renderCompatibilityDiagnosticsCard(model, selectedFile, {
    hardware: state.hardware,
    loading: state.hardwareLoading,
    error: state.hardwareError,
  });
}

function renderDetails() {
  const model = state.selectedModel;

  if (!model) {
    return renderDetailEmpty();
  }

  if (state.detailsLoading) {
    return `
      <section class="detail-loading" aria-busy="true">
        <div class="search-loading-card">
          ${renderLoadingCard()}
        </div>
      </section>
    `;
  }

  if (state.detailsError) {
    return `
      <section class="detail-error-state">
        <i class="codicon codicon-warning" aria-hidden="true"></i>
        <span>${escapeHtml(state.detailsError)}</span>
        <button class="retry-search-button" id="retry-model-details" type="button">Tentar novamente</button>
      </section>
    `;
  }

  const selectedFile = getSelectedFile();
  const tags = (model.tags || []).slice(0, 8);
  const description = getModelDescription(model);
  const huggingFaceModelUrl = getHuggingFaceModelUrl(model);
  const kind = getModelKind(model);

  return `
    <section class="detail-header ${escapeHtml(kind.className)}">
      ${renderPageHeading()}

      <div class="detail-model-kind">
        <i class="codicon codicon-${escapeHtml(kind.icon)}"></i>
        <span>${escapeHtml(kind.label)}</span>
      </div>
      <p class="detail-model-kind-description">
        <i class="codicon codicon-${escapeHtml(kind.icon)}"></i>
        ${escapeHtml(kind.note)}
      </p>
      <div class="model-heading">
        <h2>${escapeHtml(model.name)}</h2>
      </div>
      <p class="detail-author">Por ${escapeHtml(model.author)} · ${escapeHtml(model.id)}</p>

      <div class="detail-stats">
        ${renderStatItem("cloud-download", "Downloads", model.downloads)}
        ${renderStatItem("heart", "Likes", model.likes)}
      </div>

      ${renderDetailActions(model, selectedFile, huggingFaceModelUrl)}
    </section>

    ${renderCompatibilityDiagnostics(model, selectedFile)}

    <section class="detail-section">
      <h2><i class="codicon codicon-note"></i> Descrição</h2>
      <article class="description-panel">
        <h3>${escapeHtml(model.name)}</h3>
        <div class="markdown-description ${isMissingInfoValue(description) ? "muted-value" : ""}">
          ${renderMarkdown(description)}
        </div>
        <div class="tag-row">
          ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </article>
    </section>

    <section class="detail-section">
      <h2><i class="codicon codicon-info"></i> Informações do modelo</h2>
      <div class="info-panel">
        ${renderInfoItem("Repositório", model.id, true)}
        ${renderInfoItem("Autor", model.author)}
        ${renderInfoItem("Tipo", kind.label)}
        ${renderInfoItem("Formato", kind.formatLabel)}
        ${renderInfoItem("Task/pipeline", model.pipelineTag)}
        ${renderInfoItem("Acesso", getAccessLabel(model))}
        ${renderInfoItem("Atualização", formatDate(model.updatedAt))}
        ${renderInfoItem("Variantes", `${getModelFiles(model).length} variante(s)`)}
      </div>
      ${
        model.gated || model.private
          ? `<p class="access-note"><i class="codicon codicon-lock"></i> ${escapeHtml(getAccessDescription(model))}</p>`
          : ""
      }
    </section>
  `;
}
