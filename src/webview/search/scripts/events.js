// Responsabilidade: liga interacoes da UI usando delegacao para reduzir rebinding.
function bindEvents() {
  bindSearchForm();
  bindSidebarEvents();
  bindDetailEvents();
  bindDownloadsPanelEvents();
  bindVariantClose();
}

function bindSearchForm() {
  document
    .getElementById("model-search-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("model-search");
      state.downloadsPanelOpen = false;
      searchModels(input?.value || "");
    });
}

function bindSidebarEvents() {
  document
    .getElementById("downloads-toggle")
    ?.addEventListener("click", () => {
      state.downloadsPanelOpen = !state.downloadsPanelOpen;
      state.variantMenuOpen = false;
      render();
    });

  document.getElementById("model-list")?.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("#retry-model-search")) {
      searchModels(state.query, state.currentPage);
      return;
    }

    const card = target.closest(".model-card");
    const modelId = card?.getAttribute("data-model-id");
    const model = state.models.find((item) => item.id === modelId);
    selectModel(model);
  });

  document.querySelector(".model-pagination")?.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest(".pagination-button");

    if (!button || button.hasAttribute("disabled")) {
      return;
    }

    handlePaginationAction(button.getAttribute("data-pagination-action"));
  });

  document.querySelector(".model-filter-bar")?.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest(".model-filter-button");
    const filter = button?.getAttribute("data-model-filter") || "all";

    if (!button) {
      return;
    }

    state.modelFilter = normalizeModelFilter(filter);
    saveModelFilter(state.modelFilter);
    searchModels(state.query);
  });
}

function handlePaginationAction(action) {
  const direction = action === "previous" ? -1 : action === "next" ? 1 : 0;

  if (!direction) {
    return;
  }

  searchModels(state.query, clampModelPage(state.currentPage + direction));
}

function bindDetailEvents() {
  document.querySelector(".search-detail")?.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("#download-model")) {
      downloadSelectedModel();
      return;
    }

    if (target.closest("#cancel-download-model")) {
      cancelSelectedDownload();
      return;
    }

    if (target.closest("#retry-model-details")) {
      requestModelDetails(state.selectedModel?.id);
      return;
    }

    if (target.closest("#open-huggingface-file")) {
      openSelectedModelOnHuggingFace();
      return;
    }

    if (target.closest("#gguf-variant-trigger")) {
      state.variantMenuOpen = !state.variantMenuOpen;
      render();
      return;
    }

    const option = target.closest(".variant-option");

    if (option) {
      state.selectedFileName = option.getAttribute("data-file-name") || "";
      state.variantMenuOpen = false;
      render();
    }
  });

  document
    .getElementById("gguf-variant-select")
    ?.addEventListener("change", (event) => {
      state.selectedFileName = event.target?.value || "";
      render();
    });
}

function bindDownloadsPanelEvents() {
  document
    .getElementById("downloads-panel")
    ?.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("#downloads-back")) {
        state.downloadsPanelOpen = false;
        render();
        return;
      }

      if (target.closest("#clear-finished-downloads")) {
        clearFinishedDownloads();
        render();
        return;
      }

      const cancelButton = target.closest("[data-download-cancel]");

      if (cancelButton) {
        cancelDownloadItem(
          cancelButton.getAttribute("data-model-id") || "",
          cancelButton.getAttribute("data-file-name") || "",
        );
      }
    });
}

function cancelDownloadItem(modelId, fileName) {
  if (!modelId || !fileName) {
    return;
  }

  vscode.postMessage({
    type: "cancelarDownloadModeloHuggingFace",
    modelId,
    fileName,
  });
}

function clearFinishedDownloads() {
  state.downloads = (Array.isArray(state.downloads) ? state.downloads : []).filter(
    (download) => !isTerminalDownloadState(download.state),
  );
}

function bindVariantClose() {
  document
    .querySelector(".search-layout")
    ?.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (
        state.variantMenuOpen &&
        !target.closest(".variant-picker")
      ) {
        state.variantMenuOpen = false;
        render();
      }

      if (
        state.downloadsPanelOpen &&
        !target.closest("#downloads-panel") &&
        !target.closest("#downloads-toggle")
      ) {
        state.downloadsPanelOpen = false;
        render();
      }
    });
}

function downloadSelectedModel() {
  const selectedFile = getSelectedFile();

  if (!state.selectedModel || !selectedFile) {
    return;
  }

  if (isModelFileDownloading(state.selectedModel, selectedFile)) {
    return;
  }

  const model = state.selectedModel;
  const modelName = model.name || model.id;
  const format = model.format === "ONNX" ? "ONNX" : "GGUF";

  state.downloads = [
    ...(Array.isArray(state.downloads) ? state.downloads : []),
    {
      modelId: model.id,
      fileName: selectedFile.name,
      modelName,
      format,
      state: "preparando",
      percent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      currentFileName: selectedFile.name,
      fileIndex: 1,
      totalFiles: 1,
    },
  ];
  state.downloading = true;
  state.downloadingModelId = model.id;
  state.downloadingFileName = selectedFile.name;
  state.variantMenuOpen = false;
  render();
  vscode.postMessage({
    type: "baixarModeloHuggingFace",
    modelId: model.id,
    fileName: selectedFile.name,
    modelName,
    format,
  });
}

function cancelSelectedDownload() {
  const selectedFile = getSelectedFile();

  if (
    !state.selectedModel ||
    !selectedFile ||
    !isModelFileDownloading(state.selectedModel, selectedFile)
  ) {
    return;
  }

  vscode.postMessage({
    type: "cancelarDownloadModeloHuggingFace",
    modelId: state.selectedModel.id,
    fileName: selectedFile.name,
  });
}

function openSelectedModelOnHuggingFace() {
  const url = getHuggingFaceModelUrl(state.selectedModel);

  if (!url) {
    return;
  }

  vscode.postMessage({
    type: "abrirArquivoHuggingFace",
    url,
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!state.variantMenuOpen && !state.downloadsPanelOpen) {
    return;
  }

  state.variantMenuOpen = false;
  state.downloadsPanelOpen = false;
  render();
});
