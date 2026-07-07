// Responsabilidade: renderiza e filtra o catalogo de modelos pesquisaveis.
const searchableModelCatalog = [
  ["qwen3-coder-30b", "30B", "Qwen", "23/01/2025", "23.245"],
  ["phi-4-gguf", "15B", "Microsoft", "18/06/2024", "710.171"],
  ["gemma-3-27b-it", "27B", "Google", "28/11/2024", "140.294"],
  ["gpt-oss-20b", "20B", "OpenAI", "28/11/2025", "1.147.142"],
  ["ministral-3-14b-reasoning", "14B", "Mistral", "31/05/2025", "694.240"],
  ["deepseek-r1-0528-qwen3-8b", "8B", "DeepSeek", "19/10/2023", "5.583.787"],
  ["gemma-3-4b-it", "4B", "Google", "25/12/2024", "4.390.982"],
  ["granite-4-h-tiny", "7B", "IBM", "05/07/2025", "15.662"],
].map(([id, badge, author, updatedAt, downloads]) => ({
  id,
  name: id,
  badge,
  author,
  updatedAt,
  downloads,
}));

function bindSearchModelEvents() {
  renderModelCards(searchableModelCatalog);

  const modelSearch = document.getElementById("model-search");
  modelSearch?.addEventListener("input", () => {
    const query = modelSearch.value.trim().toLowerCase();
    const filteredModels = searchableModelCatalog.filter((model) =>
      `${model.name} ${model.author} ${model.badge}`
        .toLowerCase()
        .includes(query),
    );
    const activeModelId =
      document.querySelector(".model-card.active")?.getAttribute("data-id") ||
      "qwen3-coder-30b";
    const countLabel = document.getElementById("search-results-count");

    if (countLabel) {
      countLabel.textContent = query
        ? `${filteredModels.length} RESULTADOS ENCONTRADOS`
        : "628 RESULTADOS ENCONTRADOS";
    }

    renderModelCards(filteredModels, activeModelId);
  });
}

function bindModelCardEvents() {
  document.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".model-card")
        .forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
      vscode.postMessage({
        type: "abrirDetalhesModelo",
        modelId: card.getAttribute("data-id"),
      });
    });
  });
}

function renderModelCards(models, activeModelId = "qwen3-coder-30b") {
  const modelList = document.getElementById("model-list");
  if (!modelList) {return;}

  modelList.innerHTML =
    models
      .map(
        (model) => `
          <div class="model-card ${model.id === activeModelId ? "active" : ""}" data-id="${model.id}">
            <div class="model-badge">${model.badge}</div>
            <div class="model-card-info">
              <span class="model-card-name" title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</span>
              <span class="model-card-author"><i class="codicon codicon-code"></i> ${escapeHtml(model.author)}</span>
              <div class="model-card-footer">
                <span>Atualizado em ${model.updatedAt}</span>
                <span><i class="codicon codicon-cloud-download"></i> ${model.downloads}</span>
              </div>
            </div>
          </div>
        `,
      )
      .join("") ||
    `<div class="model-list-empty">Nenhum modelo encontrado</div>`;

  bindModelCardEvents();
}

function renderSearchView() {
  currentView = "search";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <div class="search-layout">
      <div class="search-sidebar">
        <div class="search-input-wrapper">
          <input type="text" id="model-search" placeholder="Pesquisar modelos..." />
          <i class="codicon codicon-search search-icon"></i>
        </div>
        <div class="search-results-info">
          <i class="codicon codicon-chevron-right"></i>
          <span id="search-results-count">628 RESULTADOS ENCONTRADOS</span>
        </div>
        <div class="model-list" id="model-list"></div>
      </div>
    </div>
  `;

  bindSearchModelEvents();
  vscode.postMessage({ type: "abrirPainelConfig", selectedView: "search" });
}
