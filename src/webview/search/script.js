const vscode = acquireVsCodeApi();

const state = {
  query: "",
  models: [],
  selectedModel: null,
  selectedFileName: "",
  detailOnly: false,
  loading: false,
  detailsLoading: false,
  downloading: false,
  variantMenuOpen: false,
  error: "",
  detailsError: "",
};

const root = document.getElementById("model-detail-view");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function getFieldValue(value, fallback = "Não informado") {
  return value === null || value === undefined || String(value).trim() === ""
    ? fallback
    : String(value).trim();
}

function isMissingInfoValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/ÃƒÂ£|Ã£/gi, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return /^nao informado$/i.test(normalized);
}

function formatDate(value) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getModelBadge(model) {
  if (model.format === "ONNX") {
    return "ONNX";
  }

  const fromName = `${model.name} ${model.id}`.match(
    /(?:^|[-_\s])(\d+(?:\.\d+)?b)(?:[-_\s]|$)/i,
  );

  return fromName?.[1]?.toUpperCase() || "GGUF";
}

function getModelFiles(model) {
  return model?.format === "ONNX"
    ? model.onnxFiles || []
    : model?.ggufFiles || [];
}

function getSelectedFile() {
  const files = getModelFiles(state.selectedModel);
  return (
    files.find((file) => file.name === state.selectedFileName) ||
    files[0] ||
    null
  );
}

function getFileSizeLabel(file) {
  const size = file?.size || "";

  return size && !/informado/i.test(size) ? size : "";
}

function getVariantLabel(model, file) {
  const count = getModelFiles(model).length;
  const size = getFileSizeLabel(file);

  return `${count} variante(s) ${size ? ` · ${size}` : ""}`;
}

function getVariantOptionLabel(file) {
  return `${file.quantization}${getFileSizeLabel(file) ? ` - ${getFileSizeLabel(file)}` : ""} - ${file.name}`;
}

function getHuggingFaceModelUrl(model) {
  const modelId = typeof model?.id === "string" ? model.id : "";

  if (!modelId) {
    return "";
  }

  return `https://huggingface.co/${modelId
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function getAccessLabel(model) {
  if (model.private) {
    return "Privado";
  }

  if (model.gated) {
    return "Gated";
  }

  return "Publico";
}

function getAccessDescription(model) {
  if (model.private) {
    return "Este repositorio e privado. Configure um token Hugging Face com acesso para consultar detalhes e baixar arquivos.";
  }

  if (model.gated) {
    return "Modelo gated: pode exigir aceite dos termos no Hugging Face e um token com permissao antes do download.";
  }

  return "Modelo publico no Hugging Face.";
}

function getModelDescription(model) {
  return getFieldValue(model.description, "Não informado");
}

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
    <div class="stat-item">
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

function renderModelCard(model) {
  const active = state.selectedModel?.id === model.id ? "active" : "";
  const primaryFile = getModelFiles(model)[0];

  return `
    <button class="model-card ${active}" type="button" data-model-id="${escapeHtml(model.id)}">
      <span class="model-badge">${escapeHtml(getModelBadge(model))}</span>
      <span class="model-card-info">
        <span class="model-card-name" title="${escapeHtml(model.id)}">${escapeHtml(model.name)}</span>
        <span class="model-card-meta">
          <span class="model-card-author"><i class="codicon codicon-code"></i> ${escapeHtml(model.author)}</span>
          <span class="model-card-variant">${escapeHtml(getVariantLabel(model, primaryFile))}</span>
        </span>
        <span class="model-card-footer">
          <span>Atualizado em ${escapeHtml(formatDate(model.updatedAt))}</span>
          <span><i class="codicon codicon-cloud-download"></i> ${escapeHtml(formatNumber(model.downloads))}</span>
          <span><i class="codicon codicon-heart"></i> ${escapeHtml(formatNumber(model.likes))}</span>
          ${model.pipelineTag ? `<span><i class="codicon codicon-symbol-method"></i> ${escapeHtml(model.pipelineTag)}</span>` : ""}
          ${model.gated || model.private ? `<span><i class="codicon codicon-lock"></i> ${escapeHtml(getAccessLabel(model))}</span>` : ""}
        </span>
      </span>
    </button>
  `;
}

function renderSidebar() {
  const resultLabel = state.loading
    ? '<span class="search-loading-spinner search-loading-spinner-small" aria-hidden="true"></span>'
    : state.error
      ? "ERRO AO PESQUISAR"
      : `${state.models.length} RESULTADOS ENCONTRADOS`;

  return `
    <aside class="search-sidebar">
      <form class="search-input-wrapper" id="model-search-form">
        <input type="text" id="model-search" placeholder="Pesquisar..." value="${escapeHtml(state.query)}" />
        <button class="search-submit" type="submit" title="Pesquisar">
          <i class="codicon codicon-search"></i>
        </button>
      </form>
      <div class="search-results-info">
        <i class="codicon codicon-chevron-right"></i>
        <span>${state.loading ? resultLabel : escapeHtml(resultLabel)}</span>
      </div>
      <div class="model-list" id="model-list">
        ${
          state.loading
            ? `<div class="model-list-loading"><div class="search-loading-card"><span class="search-loading-spinner" aria-hidden="true"></span></div></div>`
            : state.error
              ? `<div class="search-error-state">
                  <i class="codicon codicon-warning" aria-hidden="true"></i>
                  <span>${escapeHtml(state.error)}</span>
                  <button class="retry-search-button" id="retry-model-search" type="button">Tentar novamente</button>
                </div>`
              : state.models.map(renderModelCard).join("") ||
                `<div class="model-list-empty">
                  <i class="codicon codicon-search-stop" aria-hidden="true"></i>
                  <strong>Nenhum resultado foi encontrado</strong>
                  <span>Tente pesquisar usando outro nome ou termo.</span>
                </div>`
        }
      </div>
    </aside>
  `;
}

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

function renderDetails() {
  const model = state.selectedModel;

  if (!model) {
    return renderDetailEmpty();
  }

  if (state.detailsLoading) {
    return `
      <section class="detail-loading" aria-busy="true">
        <div class="search-loading-card">
          <span class="search-loading-spinner" aria-hidden="true"></span>
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

  return `
    <section class="detail-header">
      ${renderPageHeading()}

      <div class="model-heading">
        <h2>${escapeHtml(model.name)}</h2>
      </div>
      <p class="detail-author">Por ${escapeHtml(model.author)} · ${escapeHtml(model.id)}</p>

      <div class="detail-stats">
        ${renderStatItem("cloud-download", "Downloads", model.downloads)}
        ${renderStatItem("heart", "Likes", model.likes)}
      </div>

      <div class="detail-actions">
        ${
          model.format === "GGUF"
            ? `<button class="download-button" id="download-model" type="button" ${!selectedFile || state.downloading ? "disabled" : ""}>
                <i class="codicon codicon-arrow-down"></i>
                ${state.downloading ? "Baixando..." : `Baixar${getFileSizeLabel(selectedFile) ? ` ${escapeHtml(getFileSizeLabel(selectedFile))}` : ""}`}
              </button>`
            : ""
        }
        <div class="variant-picker ${state.variantMenuOpen ? "open" : ""}" title="${escapeHtml(selectedFile?.name || "Selecionar arquivo")}">
          <button class="variant-picker-trigger" id="gguf-variant-trigger" type="button" ${state.downloading || !selectedFile ? "disabled" : ""} aria-expanded="${state.variantMenuOpen ? "true" : "false"}">
            <i class="codicon codicon-versions variant-leading-icon"></i>
            <span class="variant-selected-label">${escapeHtml(selectedFile ? getVariantOptionLabel(selectedFile) : "Selecionar arquivo")}</span>
            <i class="codicon codicon-chevron-down variant-chevron-icon"></i>
          </button>
          ${
            state.variantMenuOpen
              ? `<div class="variant-options" role="listbox">
                  ${getModelFiles(model)
                    .map(
                      (file) => `
                        <button class="variant-option ${file.name === selectedFile?.name ? "selected" : ""}" type="button" data-file-name="${escapeHtml(file.name)}" role="option" aria-selected="${file.name === selectedFile?.name ? "true" : "false"}">
                          <span class="variant-option-main">${escapeHtml(file.quantization)}</span>
                          ${getFileSizeLabel(file) ? `<span class="variant-option-size">${escapeHtml(getFileSizeLabel(file))}</span>` : ""}
                          <span class="variant-option-name">${escapeHtml(file.name)}</span>
                        </button>
                      `,
                    )
                    .join("")}
                </div>`
              : ""
          }
        </div>
        <label class="variant-select" title="${escapeHtml(selectedFile?.name || "Selecionar arquivo")}">
          <i class="codicon codicon-versions variant-leading-icon"></i>
          <select id="gguf-variant-select" ${state.downloading ? "disabled" : ""}>
            ${getModelFiles(model)
              .map(
                (file) => `
                  <option value="${escapeHtml(file.name)}" ${file.name === selectedFile?.name ? "selected" : ""}>
                    ${escapeHtml(file.quantization)}${getFileSizeLabel(file) ? ` - ${escapeHtml(getFileSizeLabel(file))}` : ""} - ${escapeHtml(file.name)}
                  </option>
                `,
              )
              .join("")}
          </select>
          <i class="codicon codicon-chevron-down variant-chevron-icon"></i>
        </label>
        <button class="icon-button" id="open-huggingface-file" type="button" title="Abrir modelo no Hugging Face" ${!huggingFaceModelUrl ? "disabled" : ""}>
          <i class="codicon codicon-link-external"></i>
        </button>
      </div>
    </section>

    <section class="detail-section">
      <h2><i class="codicon codicon-info"></i> Informações do modelo</h2>
      <div class="info-panel">
        ${renderInfoItem("Repositório", model.id, true)}
        ${renderInfoItem("Autor", model.author)}
        ${renderInfoItem("Formato", model.format || "GGUF")}
        ${renderInfoItem("Task/pipeline", model.pipelineTag)}
        ${renderInfoItem("Acesso", getAccessLabel(model))}
        ${renderInfoItem("Atualização", formatDate(model.updatedAt))}
        ${renderInfoItem("Arquivos", `${getModelFiles(model).length} arquivo(s)`)}
      </div>
      ${
        model.gated || model.private
          ? `<p class="access-note"><i class="codicon codicon-lock"></i> ${escapeHtml(getAccessDescription(model))}</p>`
          : ""
      }
    </section>

    <section class="detail-section">
      <h2><i class="codicon codicon-file-binary"></i> Arquivo selecionado</h2>
      <article class="description-panel compact-panel">
        <h3>${escapeHtml(selectedFile?.name || "Nenhuma variação disponível")}</h3>
        <div class="selected-file-grid">
          ${renderInfoItem("Quantização", selectedFile?.quantization || "-")}
          ${renderInfoItem("Tamanho", getFileSizeLabel(selectedFile) || "-")}
          ${renderInfoItem("Destino", model.format === "ONNX" ? "Pasta de modelos de embeddings" : "Pasta local de modelos do ATLAS")}
        </div>
      </article>
    </section>

    <section class="detail-section">
      <h2><i class="codicon codicon-note"></i> Descrição do modelo</h2>
      <article class="description-panel">
        <h3>${escapeHtml(model.name)}</h3>
        <p class="${isMissingInfoValue(description) ? "muted-value" : ""}">${escapeHtml(description)}</p>
        <div class="tag-row">
          ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </article>
    </section>
  `;
}

function render() {
  root.innerHTML = `
    <div class="search-layout ${state.detailOnly ? "detail-only-layout" : ""}">
      ${state.detailOnly ? "" : renderSidebar()}
      <main class="search-detail">
        ${renderDetails()}
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document
    .getElementById("model-search-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("model-search");
      searchModels(input?.value || "");
    });

  document.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      const modelId = card.getAttribute("data-model-id");
      const model = state.models.find((item) => item.id === modelId);

      if (!model) {
        return;
      }

      state.selectedModel = model;
      state.selectedFileName = getModelFiles(model)[0]?.name || "";
      state.detailsLoading = true;
      state.detailsError = "";
      state.variantMenuOpen = false;
      render();
      vscode.postMessage({ type: "detalharModeloHuggingFace", modelId });
    });
  });

  document
    .getElementById("gguf-variant-select")
    ?.addEventListener("change", (event) => {
      state.selectedFileName = event.target.value;
      render();
    });

  document
    .getElementById("gguf-variant-trigger")
    ?.addEventListener("click", () => {
      state.variantMenuOpen = !state.variantMenuOpen;
      render();
    });

  document.querySelectorAll(".variant-option").forEach((option) => {
    option.addEventListener("click", () => {
      state.selectedFileName = option.getAttribute("data-file-name") || "";
      state.variantMenuOpen = false;
      render();
    });
  });

  document
    .querySelector(".search-layout")
    ?.addEventListener("click", (event) => {
      const target = event.target;

      if (
        state.variantMenuOpen &&
        target instanceof Element &&
        !target.closest(".variant-picker")
      ) {
        state.variantMenuOpen = false;
        render();
      }
    });

  document.getElementById("download-model")?.addEventListener("click", () => {
    const selectedFile = getSelectedFile();

    if (!state.selectedModel || !selectedFile) {
      return;
    }

    state.downloading = true;
    state.variantMenuOpen = false;
    render();
    vscode.postMessage({
      type: "baixarModeloHuggingFace",
      modelId: state.selectedModel.id,
      fileName: selectedFile.name,
    });
  });

  document
    .getElementById("retry-model-search")
    ?.addEventListener("click", () => {
      searchModels(state.query);
    });

  document
    .getElementById("retry-model-details")
    ?.addEventListener("click", () => {
      const modelId = state.selectedModel?.id;

      if (!modelId) {
        return;
      }

      state.detailsLoading = true;
      state.detailsError = "";
      render();
      vscode.postMessage({ type: "detalharModeloHuggingFace", modelId });
    });

  document
    .getElementById("open-huggingface-file")
    ?.addEventListener("click", () => {
      const url = getHuggingFaceModelUrl(state.selectedModel);

      if (!url) {
        return;
      }

      vscode.postMessage({
        type: "abrirArquivoHuggingFace",
        url,
      });
    });
}

function searchModels(query) {
  state.query = query.trim();
  state.loading = true;
  state.selectedModel = null;
  state.selectedFileName = "";
  state.variantMenuOpen = false;
  state.error = "";
  state.detailsError = "";
  render();
  vscode.postMessage({
    type: "buscarModelosHuggingFace",
    query: state.query,
  });
}

function showModelDetails(modelId) {
  if (!modelId) {
    return;
  }

  state.detailOnly = true;
  state.loading = false;
  state.detailsLoading = true;
  state.selectedFileName = "";
  state.variantMenuOpen = false;
  state.detailsError = "";
  state.selectedModel = {
    id: modelId,
    name: modelId.split("/").pop() || modelId,
    author: modelId.split("/")[0] || "Hugging Face",
    downloads: 0,
    likes: 0,
    gated: false,
    private: false,
    pipelineTag: null,
    updatedAt: null,
    tags: [],
    format: "GGUF",
    ggufFiles: [],
    onnxFiles: [],
    description: "",
  };
  render();
  vscode.postMessage({ type: "detalharModeloHuggingFace", modelId });
}

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "modelosHuggingFaceEncontrados") {
    if (state.detailOnly) {
      return;
    }

    state.loading = false;
    state.error = "";
    state.models = message.value?.models || [];
    state.selectedModel = state.models[0] || null;
    state.selectedFileName = getModelFiles(state.selectedModel)[0]?.name || "";
    state.variantMenuOpen = false;
    render();

    if (state.selectedModel) {
      state.detailsLoading = true;
      state.detailsError = "";
      render();
      vscode.postMessage({
        type: "detalharModeloHuggingFace",
        modelId: state.selectedModel.id,
      });
    }
  }

  if (message.type === "modeloHuggingFaceDetalhado") {
    const detailed = message.value?.model;

    if (detailed) {
      state.selectedModel = detailed;
      state.selectedFileName =
        state.selectedFileName || getModelFiles(detailed)[0]?.name || "";
    }

    state.detailsLoading = false;
    state.detailsError = "";
    state.variantMenuOpen = false;
    render();
  }

  if (message.type === "mostrarDetalhesModelo") {
    const modelId = message.modelId;

    showModelDetails(modelId);
  }

  if (message.type === "downloadModeloHuggingFaceConcluido") {
    state.downloading = false;
    state.variantMenuOpen = false;
    render();
  }

  if (message.type === "erro") {
    const messageText =
      typeof message.value === "string"
        ? message.value
        : "Nao foi possivel concluir a operacao.";

    if (state.loading) {
      state.error = messageText;
    }

    if (state.detailsLoading) {
      state.detailsError = messageText;
    }

    state.loading = false;
    state.detailsLoading = false;
    state.downloading = false;
    state.variantMenuOpen = false;
    render();
  }
});

window.addEventListener("keydown", (event) => {
  if (!state.variantMenuOpen || event.key !== "Escape") {
    return;
  }

  state.variantMenuOpen = false;
  render();
});

const initialSearchModelId =
  typeof window.__ATLAS_INITIAL_SEARCH_MODEL_ID__ === "string"
    ? window.__ATLAS_INITIAL_SEARCH_MODEL_ID__.trim()
    : "";

if (initialSearchModelId) {
  showModelDetails(initialSearchModelId);
} else {
  searchModels("");
}
