// Responsabilidade: hidrata e renderiza o seletor de provedores e modelos.
function hydratemodelsDataFromBackend(payload) {
  modelsData = {
    local: { name: "Local", type: "local", models: payload.localModels || [] },
  };

  for (const provider of payload.providers || []) {
    modelsData[provider.id] = {
      name: provider.name,
      type: "cloud",
      models: provider.models || [],
    };
  }

  selectedMode = payload.selectedMode || "local";
  selectedProvider = payload.selectedProviderId || null;

  if (selectedMode === "local") {
    const localModels = modelsData.local?.models || [];
    selectedModel =
      localModels.find((m) => m.id === payload.selectedLocalModelId) ||
      localModels[0] ||
      null;
  } else {
    selectedModel = payload.selectedCloudModelId
      ? { id: payload.selectedCloudModelId, name: payload.selectedCloudModelId }
      : null;
  }

  updateMainButton();

  if (selectedMode === "cloud" && selectedProvider) {
    isLoadingCloudModels = true;
    cloudModelLoadError = null;
    vscode.postMessage({
      type: "selecionarProviderCloud",
      providerId: selectedProvider,
    });
  } else {
    isLoadingCloudModels = false;
    cloudModelLoadError = null;
  }

  const popover = document.getElementById("agent-popover");
  if (popover && !popover.classList.contains("hidden")) {renderPopoverContent();}

  applyStudyModeState(payload.studyModeEnabled === true);
}

function renderPopoverContent() {
  const popover = document.getElementById("agent-popover");
  if (!popover) {return;}

  const cloudProviders = Object.entries(modelsData).filter(
    ([, val]) => val.type === "cloud",
  );
  const localModels = modelsData.local?.models || [];
  const cloudModels =
    selectedProvider && modelsData[selectedProvider]
      ? modelsData[selectedProvider].models || []
      : [];
  const providerText =
    selectedProvider && modelsData[selectedProvider]
      ? modelsData[selectedProvider].name
      : "Selecione um provedor";
  const modelText = selectedModel ? selectedModel.name : "Selecione um modelo";

  const localModelListHtml = isRefreshingModelCatalog
    ? `<div class="dropdown-loading"><div class="spinner small"></div><span>Atualizando modelos...</span></div>`
    : localModels.length
      ? localModels
          .map(
            (m) => `
        <div class="dropdown-item model-item ${selectedModel?.id === m.id && selectedMode === "local" ? "selected" : ""}"
          data-mode="local" data-value="${m.id}" data-name="${m.name}" title="${m.name}">
          <span class="dropdown-item-label">${m.name}</span>
        </div>`,
          )
          .join("")
      : `<div class="dropdown-empty">Nenhum modelo local encontrado</div>`;

  const providerListHtml = cloudProviders.length
    ? cloudProviders
        .map(
          ([key, val]) => `
        <div class="dropdown-item provider-item ${selectedProvider === key ? "selected" : ""}"
          data-value="${key}" title="${val.name}">
          <span class="dropdown-item-label">${val.name}</span>
        </div>`,
        )
        .join("")
    : `<div class="dropdown-empty">Nenhum provedor encontrado</div>`;

  const cloudModelListHtml = isLoadingCloudModels
    ? `<div class="dropdown-loading"><div class="spinner small"></div><span>Buscando modelos do provedor...</span></div>`
    : cloudModelLoadError
      ? `<div class="dropdown-empty dropdown-error"><i class="codicon codicon-error"></i><span>${escapeHtml(cloudModelLoadError)}</span></div>`
      : cloudModels.length
        ? cloudModels
            .map(
              (m) => `
          <div class="dropdown-item model-item ${selectedModel?.id === m.id && selectedMode === "cloud" ? "selected" : ""}"
            data-mode="cloud" data-value="${m.id}" data-name="${m.name}" title="${m.name}">
            <span class="dropdown-item-label">${m.name}</span>
          </div>`,
            )
            .join("")
        : `<div class="dropdown-empty"><i class="codicon codicon-info"></i><span>Nenhum modelo encontrado para este provedor.</span></div>`;

  popover.innerHTML = `
    <div class="popover-header">
      <button class="popover-icon-btn ${selectedMode === "local" ? "active" : ""}" id="tab-local" title="Modelos Locais">
        <i class="codicon codicon-device-desktop"></i>
      </button>
      <div class="popover-separator"></div>
      <button class="popover-icon-btn ${selectedMode === "cloud" ? "active" : ""}" id="tab-cloud" title="Nuvem">
        <i class="codicon codicon-cloud"></i>
      </button>
    </div>
    ${
      selectedMode === "local"
        ? `<div class="custom-dropdown">
          <button class="popover-dropdown-btn" id="btn-model">
            <span class="truncate">${modelText}</span>
            <i class="codicon codicon-chevron-down"></i>
          </button>
          <div class="dropdown-list dropdown-scroll hidden" id="list-model">${localModelListHtml}</div>
        </div>`
        : `<div class="custom-dropdown">
          <button class="popover-dropdown-btn" id="btn-provider">
            <span class="truncate">${providerText}</span>
            <i class="codicon codicon-chevron-down"></i>
          </button>
          <div class="dropdown-list dropdown-scroll hidden" id="list-provider">${providerListHtml}</div>
        </div>
        <div class="custom-dropdown">
          <button class="popover-dropdown-btn" id="btn-model">
            <span class="truncate model-loading-label">${
              isLoadingCloudModels
                ? '<span class="spinner small inline-spinner"></span>Carregando modelos...'
                : cloudModelLoadError
                  ? "Erro ao carregar modelos"
                  : modelText
            }</span>
            <i class="codicon codicon-chevron-down"></i>
          </button>
          <div class="dropdown-list dropdown-scroll hidden" id="list-model">${cloudModelListHtml}</div>
        </div>`
    }
  `;

  document.getElementById("tab-local")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedMode !== "local") {
      selectedMode = "local";
      selectedModel = localModels[0] || null;
      isLoadingCloudModels = false;
      cloudModelLoadError = null;
      vscode.postMessage({ type: "selecionarModo", mode: "local" });
      renderPopoverContent();
      updateMainButton();
    }
  });

  document.getElementById("tab-cloud")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedMode !== "cloud") {
      selectedMode = "cloud";
      if (!selectedProvider) {selectedProvider = cloudProviders[0]?.[0] || null;}
      selectedModel = null;
      cloudModelLoadError = null;
      vscode.postMessage({ type: "selecionarModo", mode: "cloud" });
      renderPopoverContent();
      updateMainButton();
      if (selectedProvider) {
        isLoadingCloudModels = true;
        cloudModelLoadError = null;
        renderPopoverContent();
        vscode.postMessage({
          type: "selecionarProviderCloud",
          providerId: selectedProvider,
        });
      }
    }
  });

  const btnProvider = document.getElementById("btn-provider");
  btnProvider?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("list-provider")?.classList.toggle("hidden");
    document.getElementById("list-model")?.classList.add("hidden");
  });

  document.querySelectorAll(".provider-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedProvider = item.getAttribute("data-value");
      selectedModel = null;
      isLoadingCloudModels = true;
      cloudModelLoadError = null;
      renderPopoverContent();
      updateMainButton();
      vscode.postMessage({
        type: "selecionarProviderCloud",
        providerId: selectedProvider,
      });
    });
  });

  const btnModel = document.getElementById("btn-model");
  btnModel?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("list-model")?.classList.toggle("hidden");
    document.getElementById("list-provider")?.classList.add("hidden");
  });

  document.querySelectorAll(".model-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedModel = {
        id: item.getAttribute("data-value"),
        name: item.getAttribute("data-name"),
      };
      document.getElementById("list-model")?.classList.add("hidden");
      renderPopoverContent();
      updateMainButton();
      vscode.postMessage({
        type: "selecionarModelo",
        mode: item.getAttribute("data-mode"),
        modelId: selectedModel.id,
      });
    });
  });
}

function updateMainButton() {
  const mainBtnText = document.getElementById("main-btn-text");
  if (!mainBtnText) {return;}
  if (selectedMode === "local") {
    mainBtnText.textContent = selectedModel
      ? selectedModel.name
      : "Selecionar modelo local";
    return;
  }
  const providerName =
    selectedProvider && modelsData[selectedProvider]
      ? modelsData[selectedProvider].name
      : "Nuvem";
  mainBtnText.textContent = `${providerName} · ${selectedModel ? selectedModel.name : "Selecionar modelo"}`;
}

// ── Chat events ───────────────────────────────────────────────────────────────
