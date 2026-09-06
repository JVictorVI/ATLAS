// Responsabilidade: renderiza o botao/badge e o painel de status de downloads.
function renderDownloadsToggleButton() {
  const activeCount = getActiveDownloadsCount();

  return `
    <button
      class="downloads-toggle-button ${state.downloadsPanelOpen ? "active" : ""}"
      id="downloads-toggle"
      type="button"
      title="Downloads"
      aria-label="Downloads"
      aria-expanded="${state.downloadsPanelOpen ? "true" : "false"}"
    >
      <i class="codicon codicon-cloud-download"></i>
      ${activeCount > 0 ? `<span class="downloads-badge">${escapeHtml(formatNumber(activeCount))}</span>` : ""}
    </button>
  `;
}

function renderDownloadProgressBar(download) {
  const percent = Math.min(100, Math.max(0, Number(download.percent) || 0));

  return `
    <div class="download-progress-track">
      <span class="download-progress-bar" style="width: ${percent}%;"></span>
    </div>
  `;
}

function renderDownloadFileLine(download) {
  if (download.totalFiles > 1) {
    return `arquivo ${escapeHtml(download.fileIndex)}/${escapeHtml(download.totalFiles)} ${escapeHtml(download.currentFileName)}`;
  }

  return escapeHtml(download.fileName);
}

function renderDownloadBytesLine(download) {
  const downloaded = formatBytes(download.downloadedBytes);
  const total = formatBytes(download.totalBytes);

  if (!total) {
    return "";
  }

  return `${downloaded || "0 B"} / ${total}`;
}

function renderDownloadCard(download) {
  const kind = getDownloadKindByFormat(download.format);
  const terminal = isTerminalDownloadState(download.state);
  const percent = Math.min(100, Math.max(0, Number(download.percent) || 0));
  const bytesLine = renderDownloadBytesLine(download);
  const canCancel = !terminal && download.state !== "cancelando";

  return `
    <div class="download-card download-card-${escapeHtml(download.state)} ${escapeHtml(kind.className)}">
      <div class="download-card-header">
        <span class="download-kind-pill">
          <i class="codicon codicon-${escapeHtml(kind.icon)}"></i>
          ${escapeHtml(kind.formatLabel)}
        </span>
        <span class="download-card-name" title="${escapeHtml(download.modelName)}">${escapeHtml(download.modelName)}</span>
        <span class="download-card-percent">${terminal ? "" : `${escapeHtml(percent)}%`}</span>
      </div>
      ${!terminal ? renderDownloadProgressBar(download) : ""}
      <div class="download-card-meta">
        <span class="download-card-file" title="${escapeHtml(download.currentFileName)}">${renderDownloadFileLine(download)}</span>
      </div>
      <div class="download-card-footer">
        <span class="download-card-status download-status-${escapeHtml(download.state)}">
          ${escapeHtml(getDownloadStatusLabel(download.state))}
        </span>
        ${bytesLine ? `<span class="download-card-bytes">${escapeHtml(bytesLine)}</span>` : ""}
        ${
          canCancel
            ? `<button class="download-cancel-button" type="button" data-download-cancel data-model-id="${escapeHtml(download.modelId)}" data-file-name="${escapeHtml(download.fileName)}" title="Cancelar download" aria-label="Cancelar download">
                <i class="codicon codicon-close"></i>
                Cancelar
              </button>`
            : ""
        }
      </div>
      ${
        download.state === "erro" && download.errorMessage
          ? `<p class="download-card-error">${escapeHtml(download.errorMessage)}</p>`
          : ""
      }
    </div>
  `;
}

function renderDownloadsList() {
  const downloads = Array.isArray(state.downloads) ? state.downloads : [];

  if (!downloads.length) {
    return `
      <div class="downloads-empty">
        <i class="codicon codicon-cloud-download" aria-hidden="true"></i>
        <span>Nenhum download em andamento.</span>
      </div>
    `;
  }

  return downloads.map(renderDownloadCard).join("");
}

function renderDownloadsPanel() {
  const activeCount = getActiveDownloadsCount();

  return `
    <div class="downloads-panel" id="downloads-panel">
      <div class="downloads-panel-heading">
        <i class="codicon codicon-cloud-download"></i>
        <span>Downloads</span>
        ${activeCount > 0 ? `<span class="downloads-badge downloads-badge-inline">${escapeHtml(formatNumber(activeCount))}</span>` : ""}
      </div>
      <div class="downloads-list">
        ${renderDownloadsList()}
      </div>
      <div class="downloads-footer">
        <span>${escapeHtml(formatNumber(activeCount))} downloads ativos</span>
        <button
          class="clear-finished-downloads-button"
          id="clear-finished-downloads"
          type="button"
          ${hasFinishedDownloads() ? "" : "disabled"}
        >
          Limpar concluídos
        </button>
      </div>
    </div>
  `;
}
