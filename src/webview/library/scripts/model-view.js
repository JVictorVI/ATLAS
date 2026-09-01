(() => {
  const app = window.atlasLibrary;
  const { defaultEmptyStateMessage, gpu, refs, state, ui, vscode } = app;

  function requestModels() {
    vscode.postMessage({ type: "requestModels" });
  }

  function handleModelsUpdate(message) {
    releaseLibraryLoading();
    setEmptyStateMessage(defaultEmptyStateMessage);
    state.loadedModels = Array.isArray(message.models) ? message.models : [];
    state.modelById = new Map(
      state.loadedModels
        .filter((model) => typeof model.id === "string")
        .map((model) => [model.id, model]),
    );

    renderModelDropdown();
    syncSelectedModel(message.selectedLocalModelId);

    if (state.selectedModelId) {
      selectModel(state.selectedModelId);
    }
  }

  function setLibraryLoading(loading) {
    document.body.classList.toggle("library-loading-active", loading);

    if (refs.libraryLoading) {
      refs.libraryLoading.hidden = !loading;
    }

    if (refs.libraryPage) {
      refs.libraryPage.setAttribute("aria-busy", loading ? "true" : "false");
    }
  }

  function releaseLibraryLoading() {
    state.initialModelsLoaded = true;
    window.clearTimeout(state.initialModelsTimeout);
    setLibraryLoading(false);
  }

  function releaseLibraryLoadingWithMessage(message) {
    releaseLibraryLoading();
    state.loadedModels = [];
    state.modelById = new Map();
    state.selectedModelId = null;
    state.currentGpuSliderModel = null;
    setEmptyStateMessage(message);
    renderModelDropdown();
  }

  function setEmptyStateMessage(message) {
    if (refs.emptyState) {
      refs.emptyState.textContent = message;
    }
  }

  function renderModelDropdown() {
    const list = refs.modelSelectList;

    if (!list) {
      return;
    }

    list.textContent = "";

    if (state.loadedModels.length === 0) {
      ui.toggleClass("empty-state", "hidden", false);
      ui.toggleClass("model-details", "hidden", true);
      return;
    }

    ui.toggleClass("empty-state", "hidden", true);
    const fragment = document.createDocumentFragment();

    for (const model of state.loadedModels) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "model-dropdown-item";
      item.dataset.id = model.id;
      item.innerHTML = `
        <span class="model-option-main">${ui.escapeHtml(model.name)}</span>
        <span class="model-option-meta">${ui.escapeHtml(model.provider || "Local")} · ${ui.escapeHtml(model.quant || "-")} · ${ui.escapeHtml(model.size || "-")}</span>
      `;
      item.addEventListener("click", () => {
        selectModel(model.id);
        list.classList.add("hidden");
      });
      fragment.appendChild(item);
    }

    list.appendChild(fragment);
  }

  function setupDropdown() {
    refs.modelSelectButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      requestModels();
      refs.modelSelectList?.classList.toggle("hidden");
    });

    document.addEventListener("click", (event) => {
      if (refs.modelPicker && !refs.modelPicker.contains(event.target)) {
        refs.modelSelectList?.classList.add("hidden");
      }
    });
  }

  function selectModel(id) {
    state.selectedModelId = id;
    const model = state.modelById.get(id);

    if (!model) {
      return;
    }

    ui.toggleClass("empty-state", "hidden", true);
    ui.toggleClass("model-details", "hidden", false);

    if (refs.modelSelectLabel) {
      refs.modelSelectLabel.textContent = model.name;
    }

    document.querySelectorAll(".model-dropdown-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });

    ui.setText("info-tag", `${model.quant} · ${model.size}`);
    ui.setText("info-model", model.name);
    ui.setText("info-provider", model.provider || "Local");
    ui.setText("info-quant", model.quant);
    ui.setText("info-date", model.date);
    ui.setText("info-file", model.file);
    ui.setText("info-size", model.size);

    gpu.configureGpuSlider(model);
    ui.setValue("param-context", model.params?.context);
    ui.setValue("param-max-tokens", model.params?.maxTokens);
    ui.setValue("param-temp", model.params?.temp);
    ui.setValue("param-top-p", model.params?.topP);
    ui.setValue("param-threads", model.params?.threads ?? 0);
    ui.setValue("param-batch-size", model.params?.batchSize ?? 0);
    ui.setValue("param-micro-batch-size", model.params?.microBatchSize ?? 0);
    ui.setValue(
      "param-flash-attention",
      model.params?.flashAttention ?? "auto",
    );
    ui.setValue("param-kv-cache-type", model.params?.kvCacheType ?? "auto");
    ui.setValue("param-load-mode", model.params?.loadMode ?? "auto");

    if (model.customPrompt) {
      ui.setChecked("toggle-default", false);
      ui.setChecked("toggle-custom", true);
      ui.setDisabled("system-prompt", false);
      ui.setValue("system-prompt", model.systemPrompt);
    } else {
      ui.setChecked("toggle-default", true);
      ui.setChecked("toggle-custom", false);
      ui.setDisabled("system-prompt", true);
      ui.setValue("system-prompt", "");
    }
  }

  function syncSelectedModel(activeLocalModelId) {
    const normalizedActiveId =
      typeof activeLocalModelId === "string" ? activeLocalModelId : null;
    const activeModelExists =
      normalizedActiveId !== null && state.modelById.has(normalizedActiveId);
    const selectedModelStillExists =
      state.selectedModelId !== null && state.modelById.has(state.selectedModelId);

    if (state.loadedModels.length === 0) {
      state.selectedModelId = null;
    } else if (!state.selectedModelId && activeModelExists) {
      state.selectedModelId = normalizedActiveId;
    } else if (!state.selectedModelId || !selectedModelStillExists) {
      state.selectedModelId = state.loadedModels[0].id;
    }
  }

  app.models = {
    handleModelsUpdate,
    releaseLibraryLoading,
    releaseLibraryLoadingWithMessage,
    renderModelDropdown,
    requestModels,
    selectModel,
    setupDropdown,
  };
})();
