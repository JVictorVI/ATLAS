// Responsabilidade: renderiza blocos reutilizaveis usados pela lista e detalhe.
function renderInfoItem(label, value, wide = false) {
  const normalizedValue = getFieldValue(value);

  return `
    <div class="info-item ${wide ? "info-item-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong class="${isMissingInfoValue(normalizedValue) ? "muted-value" : ""}" title="${escapeHtml(normalizedValue)}">${escapeHtml(normalizedValue)}</strong>
    </div>
  `;
}

function renderStatItem(icon, label, value) {
  return `
    <div class="stat-item stat-item-${escapeHtml(label.toLowerCase())}">
      <i class="codicon codicon-${escapeHtml(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatNumber(value))}</strong>
    </div>
  `;
}

function renderPageHeading() {
  const iconUri =
    typeof window.__ATLAS_HUGGINGFACE_ICON_URI__ === "string"
      ? window.__ATLAS_HUGGINGFACE_ICON_URI__
      : "";

  return `
    <div class="detail-page-heading">
      <span class="detail-page-icon huggingface-icon" aria-hidden="true">
        ${
          iconUri
            ? `<img class="huggingface-logo" src="${escapeHtml(iconUri)}" alt="" />`
            : `<span class="huggingface-mark">HF</span>`
        }
      </span>
      <div class="detail-page-copy">
        <h1>Repositório de Modelos</h1>
        <p>Powered by Hugging Face</p>
      </div>
    </div>
  `;
}

function renderLoadingCard(small = false) {
  const smallClass = small ? " search-loading-spinner-small" : "";

  return `<span class="search-loading-spinner${smallClass}" aria-hidden="true"></span>`;
}
