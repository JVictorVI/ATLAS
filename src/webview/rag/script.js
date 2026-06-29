const vscode = acquireVsCodeApi();
const ragPage = document.getElementById("rag-page");
const ragLoading = document.getElementById("rag-loading");
const projectsTable = document.getElementById("projects-table");
const addProjectButton = document.getElementById("add-project");
const selectFolderButton = document.getElementById("select-folder");
const addFileButton = document.getElementById("add-file");
const clearExternalDocumentsButton = document.getElementById(
  "clear-external-documents",
);
const externalDocumentsList = document.getElementById(
  "external-documents-list",
);
const externalMaxFileSizeInput = document.getElementById(
  "rag-external-max-file-size",
);
const cancelIndexingButton = document.getElementById("cancel-indexing");
const indexingProgress = document.getElementById("indexing-progress");
const indexingProgressLabel = document.getElementById(
  "indexing-progress-label",
);
const indexingProgressPercent = document.getElementById(
  "indexing-progress-percent",
);
const indexingProgressTrack = document.getElementById(
  "indexing-progress-track",
);
const indexingProgressBar = document.getElementById("indexing-progress-bar");
const indexingProgressCount = document.getElementById(
  "indexing-progress-count",
);
const indexingProgressFile = document.getElementById("indexing-progress-file");
const topKInput = document.getElementById("rag-top-k");
const contextLimitInput = document.getElementById("rag-context-limit");
const ignoredPathsInput = document.getElementById("rag-ignored-paths");
const chunkSizeInput = document.getElementById("rag-chunk-size");
const chunkOverlapInput = document.getElementById("rag-chunk-overlap");
const maxFileSizeInput = document.getElementById("rag-max-file-size");
const allowedExtensionsInput = document.getElementById(
  "rag-allowed-extensions",
);
const respectGitIgnoreInput = document.getElementById("rag-respect-gitignore");
const markdownFilesInput = document.getElementById("rag-markdown-files");
const configFilesInput = document.getElementById("rag-config-files");
const indexOnAddInput = document.getElementById("rag-index-on-add");
const debounceInput = document.getElementById("rag-debounce");
const relevanceModeInput = document.getElementById("rag-relevance-mode");
const relevanceThresholdInput = document.getElementById(
  "rag-relevance-threshold",
);
const maxChunksPerFileInput = document.getElementById("rag-max-chunks-file");
const sourcePriorityInput = document.getElementById("rag-source-priority");
const languageFiltersInput = document.getElementById("rag-language-filters");
const directoryFiltersInput = document.getElementById("rag-directory-filters");
const diversifyFilesInput = document.getElementById("rag-diversify-files");
const excludeActiveFileInput = document.getElementById(
  "rag-exclude-active-file",
);
const externalDocumentsInput = document.getElementById(
  "rag-external-documents",
);
const showSourcesInput = document.getElementById("rag-show-sources");
const embeddingModelsFolderInput = document.getElementById(
  "embedding-models-folder-path",
);
const chooseEmbeddingModelsFolderButton = document.getElementById(
  "choose-embedding-models-folder",
);
const openEmbeddingModelsFolderButton = document.getElementById(
  "open-embedding-models-folder",
);
const downloadDefaultEmbeddingModelButton = document.getElementById(
  "download-default-embedding-model",
);
const embeddingDefaultModelAction = document.getElementById(
  "embedding-default-model-action",
);
const embeddingModelGrid = document.getElementById("embedding-model-grid");
const embeddingModelSelect = document.getElementById("rag-embedding-model");
const embeddingModelStatus = document.getElementById("embedding-model-status");
let indexingInProgress = false;
let externalDocumentsInProgress = false;
let externalDocumentsCount = 0;
let embeddingModelsRefreshInProgress = false;
let initialRagStateLoaded = false;
let initialRagStateTimeout = undefined;

function showFeedback(message, level = "info") {
  if (!message) {
    return;
  }

  vscode.postMessage({
    type: "mostrarNotificacaoRag",
    message,
    level,
  });
}

function saveRagSettings(options = {}) {
  const topK = Number.parseInt(topKInput?.value ?? "", 10);
  const maxContextCharacters = Number.parseInt(
    contextLimitInput?.value ?? "",
    10,
  );
  const chunkSize = Number.parseInt(chunkSizeInput?.value ?? "", 10);
  const chunkOverlap = Number.parseInt(chunkOverlapInput?.value ?? "", 10);
  const maxFileSizeMb = Number.parseInt(maxFileSizeInput?.value ?? "", 10);
  const externalMaxFileSizeMb = Number.parseInt(
    externalMaxFileSizeInput?.value ?? "",
    10,
  );
  const autoIndexDebounceMs = Number.parseInt(debounceInput?.value ?? "", 10);
  const relevanceThreshold = Number.parseFloat(
    relevanceThresholdInput?.value ?? "",
  );
  const maxChunksPerFile = Number.parseInt(
    maxChunksPerFileInput?.value ?? "",
    10,
  );

  if (!Number.isInteger(topK) || topK < 1 || topK > 30) {
    showFeedback("topK deve ser um número inteiro entre 1 e 30.", "warning");
    topKInput?.focus();
    return;
  }

  if (
    !Number.isInteger(maxContextCharacters) ||
    maxContextCharacters < 1000 ||
    maxContextCharacters > 100000
  ) {
    showFeedback(
      "O limite de contexto deve ficar entre 1.000 e 100.000.",
      "warning",
    );
    contextLimitInput?.focus();
    return;
  }

  if (!Number.isInteger(chunkSize) || chunkSize < 300 || chunkSize > 12000) {
    showFeedback(
      "O tamanho do chunk deve ficar entre 300 e 12.000.",
      "warning",
    );
    chunkSizeInput?.focus();
    return;
  }

  if (
    !Number.isInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap > Math.floor(chunkSize / 2)
  ) {
    showFeedback(
      "A sobreposição deve ficar entre 0 e metade do chunk.",
      "warning",
    );
    chunkOverlapInput?.focus();
    return;
  }

  if (
    !Number.isInteger(maxFileSizeMb) ||
    maxFileSizeMb < 1 ||
    maxFileSizeMb > 100
  ) {
    showFeedback(
      "O tamanho máximo por arquivo deve ficar entre 1 e 100 MB.",
      "warning",
    );
    maxFileSizeInput?.focus();
    return;
  }

  if (
    !Number.isInteger(externalMaxFileSizeMb) ||
    externalMaxFileSizeMb < 1 ||
    externalMaxFileSizeMb > 250
  ) {
    showFeedback(
      "O tamanho máximo por documento externo deve ficar entre 1 e 250 MB.",
      "warning",
    );
    externalMaxFileSizeInput?.focus();
    return;
  }

  if (
    !Number.isInteger(autoIndexDebounceMs) ||
    autoIndexDebounceMs < 500 ||
    autoIndexDebounceMs > 60000
  ) {
    showFeedback("O debounce deve ficar entre 500 e 60.000 ms.", "warning");
    debounceInput?.focus();
    return;
  }

  const allowedExtensions = parseExtensions(
    allowedExtensionsInput?.value ?? "",
  );

  if (!allowedExtensions.length) {
    showFeedback("Informe ao menos uma extensão permitida.", "warning");
    allowedExtensionsInput?.focus();
    return;
  }

  const relevanceMode = relevanceModeInput?.value ?? "maxDistance";
  const maximumThreshold = relevanceMode === "minRelevance" ? 1 : 2;

  if (
    !Number.isFinite(relevanceThreshold) ||
    relevanceThreshold < 0 ||
    relevanceThreshold > maximumThreshold
  ) {
    showFeedback(
      relevanceMode === "minRelevance"
        ? "A relevância mínima deve ficar entre 0 e 1."
        : "A distância máxima deve ficar entre 0 e 2.",
      "warning",
    );
    relevanceThresholdInput?.focus();
    return;
  }

  if (
    !Number.isInteger(maxChunksPerFile) ||
    maxChunksPerFile < 1 ||
    maxChunksPerFile > 20
  ) {
    showFeedback(
      "O máximo de chunks por arquivo deve ficar entre 1 e 20.",
      "warning",
    );
    maxChunksPerFileInput?.focus();
    return;
  }

  vscode.postMessage({
    type: "salvarConfiguracoesRag",
    payload: {
      enabled: document.getElementById("rag-enabled")?.checked === true,
      allowCloudContext:
        document.getElementById("cloud-rag-enabled")?.checked === true,
      autoIndex:
        document.getElementById("auto-index-enabled")?.checked === true,
      embeddingModel: embeddingModelSelect?.value || undefined,
      topK,
      maxContextCharacters,
      ignoredPaths: parseIgnoredPaths(ignoredPathsInput?.value ?? ""),
      chunkSize,
      chunkOverlap,
      maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
      externalDocumentMaxFileSizeBytes: externalMaxFileSizeMb * 1024 * 1024,
      allowedExtensions,
      respectGitIgnore: respectGitIgnoreInput?.checked === true,
      includeMarkdownFiles: markdownFilesInput?.checked === true,
      includeConfigFiles: configFilesInput?.checked === true,
      indexOnAdd: indexOnAddInput?.checked === true,
      autoIndexDebounceMs,
      relevanceMode,
      relevanceThreshold,
      maxChunksPerFile,
      diversifyFiles: diversifyFilesInput?.checked === true,
      excludeActiveFile: excludeActiveFileInput?.checked === true,
      includeExternalDocuments: externalDocumentsInput?.checked === true,
      sourcePriority: sourcePriorityInput?.value ?? "balanced",
      languageFilters: parseSimpleList(languageFiltersInput?.value ?? ""),
      directoryFilters: parseIgnoredPaths(directoryFiltersInput?.value ?? ""),
      showSources: showSourcesInput?.checked === true,
    },
  });
}

document.getElementById("rag-enabled")?.addEventListener("change", () => {
  saveRagSettings();
});

document.getElementById("cloud-rag-enabled")?.addEventListener("change", () => {
  saveRagSettings();
});

document
  .getElementById("auto-index-enabled")
  ?.addEventListener("change", () => {
    saveRagSettings();
  });

externalDocumentsInput?.addEventListener("change", () => {
  saveRagSettings();
});

externalMaxFileSizeInput?.addEventListener("change", () => {
  saveRagSettings();
});

document.getElementById("save-rag-settings")?.addEventListener("click", () => {
  saveRagSettings({ notify: true });
});

document
  .getElementById("save-indexing-settings")
  ?.addEventListener("click", () => {
    saveRagSettings({ notify: true });
  });

document
  .getElementById("save-retrieval-settings")
  ?.addEventListener("click", () => {
    saveRagSettings({ notify: true });
  });

document.getElementById("add-project")?.addEventListener("click", () => {
  setIndexingState(true);
  vscode.postMessage({ type: "indexarWorkspaceRag" });
});

selectFolderButton?.addEventListener("click", () => {
  setIndexingState(true);
  vscode.postMessage({ type: "selecionarPastaRag" });
});

cancelIndexingButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "cancelarIndexacaoRag" });
});

chooseEmbeddingModelsFolderButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "selecionarPastaModelosEmbeddingRag" });
});

openEmbeddingModelsFolderButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "abrirPastaModelosEmbeddingRag" });
});

downloadDefaultEmbeddingModelButton?.addEventListener("click", () => {
  setEmbeddingDownloadState(true);
  vscode.postMessage({ type: "baixarModeloEmbeddingPadraoRag" });
});

embeddingModelSelect?.addEventListener("pointerdown", () => {
  refreshEmbeddingModelsFromSelector();
});

embeddingModelSelect?.addEventListener("focus", () => {
  refreshEmbeddingModelsFromSelector();
});

embeddingModelSelect?.addEventListener("change", () => {
  const modelId = embeddingModelSelect.value;

  if (!modelId) {
    return;
  }

  vscode.postMessage({
    type: "selecionarModeloEmbeddingRag",
    modelId,
  });
});

addFileButton?.addEventListener("click", () => {
  setExternalDocumentsState(true);
  vscode.postMessage({ type: "adicionarDocumentoExternoRag" });
});

clearExternalDocumentsButton?.addEventListener("click", () => {
  setExternalDocumentsState(true);
  vscode.postMessage({ type: "removerTodosDocumentosExternosRag" });
});

document.querySelectorAll(".more-button").forEach((button) => {
  button.addEventListener("click", () => {
    showFeedback("Opções do documento ainda não disponíveis.");
  });
});

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "erro") {
    setIndexingState(false);
    setExternalDocumentsState(false);
    setEmbeddingDownloadState(false);
    embeddingModelsRefreshInProgress = false;

    if (!initialRagStateLoaded) {
      releaseRagLoadingWithError(
        `Não foi possível carregar as informações do RAG: ${message.value ?? "erro desconhecido"}`,
      );
    }

    return;
  }

  if (message.type === "progressoIndexacaoRag") {
    if (!indexingInProgress) {
      setIndexingState(true);
    }

    updateIndexingProgress(message.value ?? {});
    return;
  }

  if (message.type === "indexacaoRagConcluida") {
    updateIndexingProgress({
      phase: "completed",
      processedChunks: message.value?.project?.chunkCount ?? 0,
      totalChunks: message.value?.project?.chunkCount ?? 0,
    });
    setIndexingState(false);
    renderProjects(message.value?.projects ?? []);
    showFeedback("Workspace indexado com sucesso.");
    return;
  }

  if (message.type === "projetoRagAdicionado") {
    setIndexingState(false);
    renderProjects(message.value?.projects ?? []);
    showFeedback(
      "Projeto adicionado. Use Reindexar para criar a base vetorial.",
    );
    return;
  }

  if (message.type === "indexacaoRagCancelada") {
    setIndexingState(false);
    renderProjects(message.value?.projects ?? []);
    showFeedback("Indexação cancelada.");
    return;
  }

  if (message.type === "projetoRagExcluido") {
    renderProjects(message.value?.projects ?? []);
    showFeedback("Base vetorial excluída.");
    return;
  }

  if (message.type === "projetosRagAtualizados") {
    renderProjects(message.value?.projects ?? []);
    return;
  }

  if (message.type === "documentosExternosRagAtualizados") {
    setExternalDocumentsState(false);
    renderExternalDocuments(message.value?.documents ?? []);

    if (message.value?.cancelled === true) {
      return;
    }

    if (message.value?.deleted === true) {
      showFeedback("Documento externo removido do RAG.");
      return;
    }

    if (message.value?.deletedAll === true) {
      showFeedback("Todos os documentos externos foram removidos do RAG.");
      return;
    }

    const importedCount = Number(message.value?.importedCount) || 0;
    const skipped = Array.isArray(message.value?.skipped)
      ? message.value.skipped
      : [];

    if (importedCount > 0) {
      showFeedback(
        `${importedCount} ${importedCount === 1 ? "documento externo adicionado" : "documentos externos adicionados"} ao RAG.`,
      );
    }

    if (skipped.length > 0) {
      const firstReason = skipped[0]?.reason ? `: ${skipped[0].reason}` : "";
      showFeedback(
        `${skipped.length} ${skipped.length === 1 ? "arquivo foi ignorado" : "arquivos foram ignorados"}${firstReason}`,
        "warning",
      );
    }

    if (importedCount === 0 && skipped.length === 0) {
      showFeedback("Nenhum documento externo foi adicionado.", "warning");
    }

    return;
  }

  if (message.type === "configuracoesRagSalvas") {
    showFeedback("Configurações do RAG salvas.");
    return;
  }

  if (message.type === "downloadModeloEmbeddingRagCancelado") {
    setEmbeddingDownloadState(false);
    embeddingModelsRefreshInProgress = false;
    return;
  }

  if (message.type === "modelosEmbeddingRagAtualizados") {
    embeddingModelsRefreshInProgress = false;
    renderEmbeddingModels(
      message.value?.models ?? [],
      message.value?.selectedModelId ?? "",
      message.value?.modelsDir ?? "",
    );

    if (message.value?.silent !== true) {
      showFeedback("Lista de modelos de embeddings atualizada.");
    }

    return;
  }

  if (message.type !== "estadoRagCarregado") {
    return;
  }

  setEmbeddingDownloadState(false);

  const settings = message.value?.settings ?? {};
  const runtime = message.value?.runtime ?? {};
  const ragEnabled = document.getElementById("rag-enabled");
  const cloudEnabled = document.getElementById("cloud-rag-enabled");
  const autoIndexEnabled = document.getElementById("auto-index-enabled");
  const runtimeStatus = document.getElementById("rag-runtime-status");

  if (ragEnabled) {
    ragEnabled.checked = settings.enabled === true;
  }

  if (cloudEnabled) {
    cloudEnabled.checked = settings.allowCloudContext === true;
  }

  if (autoIndexEnabled) {
    autoIndexEnabled.checked = settings.autoIndex === true;
  }

  if (topKInput) {
    topKInput.value = String(settings.topK ?? 6);
  }

  if (contextLimitInput) {
    contextLimitInput.value = String(settings.maxContextCharacters ?? 12000);
  }

  if (ignoredPathsInput) {
    ignoredPathsInput.value = Array.isArray(settings.ignoredPaths)
      ? settings.ignoredPaths.join("\n")
      : "";
  }

  if (chunkSizeInput) {
    chunkSizeInput.value = String(settings.chunkSize ?? 1000);
  }

  if (chunkOverlapInput) {
    chunkOverlapInput.value = String(settings.chunkOverlap ?? 200);
  }

  if (maxFileSizeInput) {
    maxFileSizeInput.value = String(
      Math.max(1, Math.round((settings.maxFileSizeBytes ?? 2097152) / 1048576)),
    );
  }

  if (externalMaxFileSizeInput) {
    externalMaxFileSizeInput.value = String(
      Math.max(
        1,
        Math.round(
          (settings.externalDocumentMaxFileSizeBytes ?? 26214400) / 1048576,
        ),
      ),
    );
  }

  if (allowedExtensionsInput) {
    allowedExtensionsInput.value = Array.isArray(settings.allowedExtensions)
      ? settings.allowedExtensions.join("\n")
      : "";
  }

  if (respectGitIgnoreInput) {
    respectGitIgnoreInput.checked = settings.respectGitIgnore !== false;
  }

  if (markdownFilesInput) {
    markdownFilesInput.checked = settings.includeMarkdownFiles !== false;
  }

  if (configFilesInput) {
    configFilesInput.checked = settings.includeConfigFiles !== false;
  }

  if (indexOnAddInput) {
    indexOnAddInput.checked = settings.indexOnAdd !== false;
  }

  if (debounceInput) {
    debounceInput.value = String(settings.autoIndexDebounceMs ?? 2000);
  }

  if (relevanceModeInput) {
    relevanceModeInput.value = settings.relevanceMode ?? "maxDistance";
  }

  if (relevanceThresholdInput) {
    relevanceThresholdInput.value = String(settings.relevanceThreshold ?? 0.9);
  }

  if (maxChunksPerFileInput) {
    maxChunksPerFileInput.value = String(settings.maxChunksPerFile ?? 2);
  }

  if (sourcePriorityInput) {
    sourcePriorityInput.value = settings.sourcePriority ?? "balanced";
  }

  if (languageFiltersInput) {
    languageFiltersInput.value = Array.isArray(settings.languageFilters)
      ? settings.languageFilters.join("\n")
      : "";
  }

  if (directoryFiltersInput) {
    directoryFiltersInput.value = Array.isArray(settings.directoryFilters)
      ? settings.directoryFilters.join("\n")
      : "";
  }

  if (diversifyFilesInput) {
    diversifyFilesInput.checked = settings.diversifyFiles !== false;
  }

  if (excludeActiveFileInput) {
    excludeActiveFileInput.checked = settings.excludeActiveFile !== false;
  }

  if (externalDocumentsInput) {
    externalDocumentsInput.checked =
      settings.includeExternalDocuments !== false;
  }

  if (showSourcesInput) {
    showSourcesInput.checked = settings.showSources !== false;
  }

  renderEmbeddingModels(
    message.value?.embeddingModels ?? [],
    settings.embeddingModel ?? "",
    message.value?.embeddingModelsDir ?? settings.embeddingModelsDir ?? "",
  );

  if (runtimeStatus) {
    if (runtime.running) {
      runtimeStatus.textContent = `ChromaDB ativo em ${runtime.host}:${runtime.port}`;
    } else if (runtime.errorMessage) {
      runtimeStatus.textContent = `Indisponível: ${runtime.errorMessage}`;
    } else {
      runtimeStatus.textContent = "ChromaDB parado";
    }
  }

  renderProjects(message.value?.projects ?? []);
  renderExternalDocuments(message.value?.externalDocuments ?? []);
  initialRagStateLoaded = true;
  window.clearTimeout(initialRagStateTimeout);
  setRagLoading(false);
});

function setRagLoading(loading) {
  document.body.classList.toggle("rag-loading-active", loading);

  if (ragLoading) {
    ragLoading.hidden = !loading;
  }

  if (ragPage) {
    ragPage.setAttribute("aria-busy", loading ? "true" : "false");

    if (loading) {
      ragPage.setAttribute("aria-hidden", "true");
    } else {
      ragPage.removeAttribute("aria-hidden");
    }
  }
}

function releaseRagLoadingWithError(message) {
  initialRagStateLoaded = true;
  window.clearTimeout(initialRagStateTimeout);
  setRagLoading(false);
  showFeedback(message, "error");

  const runtimeStatus = document.getElementById("rag-runtime-status");

  if (runtimeStatus) {
    runtimeStatus.textContent = "Não foi possível verificar o ChromaDB.";
  }
}

function renderEmbeddingModels(models, selectedModelId, modelsDir) {
  const safeModels = Array.isArray(models) ? models : [];

  if (embeddingModelsFolderInput) {
    embeddingModelsFolderInput.value = modelsDir || "";
    embeddingModelsFolderInput.title = modelsDir || "";
  }

  if (!embeddingModelSelect) {
    return;
  }

  embeddingModelSelect.innerHTML = "";
  setDefaultEmbeddingModelActionVisibility(safeModels.length === 0);

  if (!safeModels.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhum modelo encontrado";
    embeddingModelSelect.appendChild(option);
    embeddingModelSelect.disabled = false;

    if (embeddingModelStatus) {
      embeddingModelStatus.textContent =
        "Nenhum modelo compatível encontrado. Escolha uma pasta ou baixe o modelo padrão.";
    }

    return;
  }

  embeddingModelSelect.disabled = false;
  const selectedExists = safeModels.some(
    (model) => model.id === selectedModelId,
  );

  if (selectedModelId && !selectedExists) {
    const missingOption = document.createElement("option");
    missingOption.value = selectedModelId;
    missingOption.textContent = `${selectedModelId} (não encontrado)`;
    embeddingModelSelect.appendChild(missingOption);
  }

  safeModels.forEach((model) => {
    const option = document.createElement("option");
    const sourceLabel = model.source === "bundled" ? "empacotado" : "pasta";
    const details = [
      model.dimensions ? `${model.dimensions}d` : "",
      sourceLabel,
    ]
      .filter(Boolean)
      .join(" • ");

    option.value = model.id;
    option.textContent = details
      ? `${model.name || model.id} — ${details}`
      : model.name || model.id;
    option.title = model.path || "";
    embeddingModelSelect.appendChild(option);
  });

  embeddingModelSelect.value = selectedModelId || safeModels[0]?.id || "";

  if (embeddingModelStatus) {
    const selected = safeModels.find(
      (model) => model.id === embeddingModelSelect.value,
    );

    embeddingModelStatus.textContent = selected
      ? `${safeModels.length} modelo(s) disponível(is). Ativo: ${selected.name || selected.id} (${selected.sizeLabel || "tamanho desconhecido"}).`
      : selectedModelId
        ? `Modelo configurado não encontrado: ${selectedModelId}. Escolha outro modelo disponível.`
        : `${safeModels.length} modelo(s) disponível(is).`;
  }
}

function setDefaultEmbeddingModelActionVisibility(visible) {
  if (!embeddingDefaultModelAction) {
    return;
  }

  embeddingDefaultModelAction.hidden = !visible;
  embeddingDefaultModelAction.style.display = visible ? "" : "none";
  embeddingModelGrid?.classList.toggle("is-model-ready", !visible);
}

function refreshEmbeddingModelsFromSelector() {
  if (embeddingModelsRefreshInProgress) {
    return;
  }

  embeddingModelsRefreshInProgress = true;

  if (embeddingModelStatus) {
    embeddingModelStatus.textContent = "Atualizando modelos disponíveis...";
  }

  vscode.postMessage({
    type: "atualizarModelosEmbeddingRag",
    silent: true,
  });
}

function setEmbeddingDownloadState(downloading) {
  if (!downloadDefaultEmbeddingModelButton) {
    return;
  }

  downloadDefaultEmbeddingModelButton.disabled = downloading;
  downloadDefaultEmbeddingModelButton.textContent = downloading
    ? "Baixando..."
    : "Baixar modelo padrão";
}

function setIndexingState(indexing) {
  indexingInProgress = indexing;

  if (indexingProgress) {
    indexingProgress.hidden = !indexing;
  }

  if (indexing) {
    resetIndexingProgress();
  }

  if (addProjectButton) {
    addProjectButton.disabled = indexing;
    addProjectButton.textContent = indexing
      ? "Indexando..."
      : "Indexar workspace atual";
  }

  if (selectFolderButton) {
    selectFolderButton.disabled = indexing;
  }

  if (cancelIndexingButton) {
    cancelIndexingButton.hidden = !indexing;
  }
}

function setExternalDocumentsState(loading) {
  externalDocumentsInProgress = loading;

  if (!addFileButton) {
    if (clearExternalDocumentsButton) {
      clearExternalDocumentsButton.disabled =
        loading || externalDocumentsCount === 0;
    }

    document.querySelectorAll(".document-delete-button").forEach((button) => {
      button.disabled = loading;
    });
    return;
  }

  addFileButton.disabled = loading;
  addFileButton.textContent = loading ? "Adicionando..." : "Adicionar arquivos";
  if (clearExternalDocumentsButton) {
    clearExternalDocumentsButton.disabled =
      loading || externalDocumentsCount === 0;
  }

  document.querySelectorAll(".document-delete-button").forEach((button) => {
    button.disabled = loading;
  });
}

function resetIndexingProgress() {
  if (!indexingProgressTrack || !indexingProgressBar) {
    return;
  }

  indexingProgressTrack.classList.add("is-indeterminate");
  indexingProgressTrack.removeAttribute("aria-valuenow");
  indexingProgressBar.style.width = "";

  if (indexingProgressLabel) {
    indexingProgressLabel.textContent = "Preparando indexação...";
  }

  if (indexingProgressPercent) {
    indexingProgressPercent.textContent = "";
  }

  if (indexingProgressCount) {
    indexingProgressCount.textContent = "Aguardando análise dos arquivos...";
  }

  if (indexingProgressFile) {
    indexingProgressFile.textContent = "";
    indexingProgressFile.title = "";
  }
}

function updateIndexingProgress(progress) {
  if (!indexingProgressTrack || !indexingProgressBar) {
    return;
  }

  const phase = progress.phase ?? "scanning";
  const processedFiles = Math.max(0, Number(progress.processedFiles) || 0);
  const totalFiles = Math.max(0, Number(progress.totalFiles) || 0);
  const processedChunks = Math.max(0, Number(progress.processedChunks) || 0);
  const totalChunks = Math.max(0, Number(progress.totalChunks) || 0);
  let label = "Preparando indexação...";
  let details = "Analisando o projeto...";
  let percentage = null;

  if (phase === "scanning") {
    label = "Analisando arquivos";
    details = `${totalFiles} ${totalFiles === 1 ? "arquivo encontrado" : "arquivos encontrados"}`;
  } else if (phase === "chunking") {
    label = "Preparando chunks";
    percentage = calculatePercentage(processedFiles, totalFiles);
    const remainingFiles = Math.max(0, totalFiles - processedFiles);
    details = `${processedChunks} chunks preparados • ${remainingFiles} ${remainingFiles === 1 ? "arquivo restante" : "arquivos restantes"}`;
  } else if (phase === "embedding") {
    label = "Gerando embeddings";
    percentage = calculatePercentage(processedChunks, totalChunks);
    const remainingChunks = Math.max(0, totalChunks - processedChunks);
    details = `${processedChunks} de ${totalChunks} chunks processados • ${remainingChunks} restantes`;
  } else if (phase === "saving") {
    label = "Salvando base vetorial";
    percentage = 100;
    details = `${totalChunks} chunks processados`;
  } else if (phase === "completed") {
    label = "Indexação concluída";
    percentage = 100;
    details = `${totalChunks} chunks indexados`;
  }

  if (percentage === null) {
    indexingProgressTrack.classList.add("is-indeterminate");
    indexingProgressTrack.removeAttribute("aria-valuenow");
    indexingProgressBar.style.width = "";
  } else {
    indexingProgressTrack.classList.remove("is-indeterminate");
    indexingProgressTrack.setAttribute("aria-valuenow", String(percentage));
    indexingProgressBar.style.width = `${percentage}%`;
  }

  if (indexingProgressLabel) {
    indexingProgressLabel.textContent = label;
  }

  if (indexingProgressPercent) {
    indexingProgressPercent.textContent =
      percentage === null ? "" : `${percentage}%`;
  }

  if (indexingProgressCount) {
    indexingProgressCount.textContent = details;
  }

  if (indexingProgressFile) {
    const currentFile = String(progress.currentFile ?? "");
    indexingProgressFile.textContent = currentFile;
    indexingProgressFile.title = currentFile;
  }
}

function calculatePercentage(processed, total) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}

function renderExternalDocuments(documents) {
  if (!externalDocumentsList) {
    return;
  }

  externalDocumentsList.innerHTML = "";
  const safeDocuments = Array.isArray(documents) ? documents : [];
  externalDocumentsCount = safeDocuments.length;

  if (clearExternalDocumentsButton) {
    clearExternalDocumentsButton.disabled =
      externalDocumentsInProgress || externalDocumentsCount === 0;
  }

  if (!safeDocuments.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhum documento externo adicionado.";
    externalDocumentsList.appendChild(empty);
    return;
  }

  safeDocuments.forEach((documentInfo) => {
    externalDocumentsList.appendChild(createExternalDocumentItem(documentInfo));
  });
}

function createExternalDocumentItem(documentInfo) {
  const item = document.createElement("article");
  item.className = "document-item";

  const icon = document.createElement("div");
  icon.className = "document-icon";
  icon.textContent = getDocumentTypeLabel(documentInfo.fileType);

  const copy = document.createElement("div");
  copy.className = "document-copy";

  const title = document.createElement("strong");
  title.textContent = documentInfo.name || "Documento externo";
  title.title = documentInfo.absolutePath || documentInfo.relativePath || "";

  const details = document.createElement("span");
  details.textContent = [
    documentInfo.fileType || "Documento",
    formatBytes(Number(documentInfo.sizeBytes) || 0),
    `${Number(documentInfo.chunkCount) || 0} chunks`,
    formatDate(documentInfo.modifiedAt),
  ]
    .filter(Boolean)
    .join(" - ");

  copy.append(title, details);

  const deleteButton = document.createElement("button");
  deleteButton.className = "btn btn-danger document-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Excluir";
  deleteButton.disabled = externalDocumentsInProgress;
  deleteButton.addEventListener("click", () => {
    if (!documentInfo.sourceId) {
      return;
    }

    setExternalDocumentsState(true);
    vscode.postMessage({
      type: "excluirDocumentoExternoRag",
      sourceId: documentInfo.sourceId,
    });
  });

  item.append(icon, copy, deleteButton);
  return item;
}

function getDocumentTypeLabel(fileType) {
  const label = String(fileType || "DOC")
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 4)
    .toUpperCase();

  return label || "DOC";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("pt-BR");
}

function renderProjects(projects) {
  if (!projectsTable) {
    return;
  }

  projectsTable
    .querySelectorAll(".project-row:not(.project-header), .empty-state")
    .forEach((element) => element.remove());

  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhum projeto indexado.";
    projectsTable.appendChild(empty);
    return;
  }

  projects.forEach((project) => {
    projectsTable.appendChild(createProjectRow(project));
  });
}

function createProjectRow(project) {
  const row = document.createElement("div");
  row.className = "project-row";
  row.setAttribute("role", "row");

  row.appendChild(createCell("Projeto", project.name || project.projectId));
  row.appendChild(
    createCell(
      "Caminho",
      abbreviateProjectPath(project.rootPath || ""),
      project.rootPath || "",
    ),
  );
  row.appendChild(
    createCell("N.º de Arquivos", `${project.sourceCount ?? 0} arquivos`),
  );
  row.appendChild(createCell("Tamanho", formatBytes(project.sizeBytes ?? 0)));

  const statusCell = createCell("Status", "");
  const status = document.createElement("strong");
  status.className = `status status-${project.status}`;
  status.textContent = getStatusLabel(project);
  status.title = project.errorMessage || "";
  statusCell.appendChild(status);
  row.appendChild(statusCell);

  const actions = document.createElement("span");
  actions.className = "row-actions";
  actions.dataset.label = "Ações";
  actions.setAttribute("role", "cell");

  const reindexButton = document.createElement("button");
  reindexButton.className = "btn btn-outline";
  reindexButton.type = "button";
  reindexButton.textContent = "Reindexar";
  reindexButton.addEventListener("click", () => {
    setIndexingState(true);
    vscode.postMessage({
      type: "reindexarProjetoRag",
      projectId: project.projectId,
    });
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "btn btn-danger";
  deleteButton.type = "button";
  deleteButton.textContent = "Excluir";
  deleteButton.addEventListener("click", () => {
    vscode.postMessage({
      type: "excluirProjetoRag",
      projectId: project.projectId,
    });
  });

  actions.append(reindexButton, deleteButton);
  row.appendChild(actions);
  return row;
}

function createCell(label, value, title = "") {
  const cell = document.createElement("span");
  cell.dataset.label = label;
  cell.setAttribute("role", "cell");
  cell.textContent = value;

  if (label === "Caminho") {
    cell.classList.add("path-cell");
  }

  if (title) {
    cell.title = title;
  }

  return cell;
}

function getStatusLabel(project) {
  const labels = {
    "not-indexed": "Não indexado",
    indexing: "Indexando...",
    ready: "Atualizado",
    outdated: "Desatualizado",
    error: "Erro",
  };

  return labels[project.status] ?? project.status ?? "Desconhecido";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function abbreviateProjectPath(value) {
  const fullPath = String(value || "");

  if (!fullPath) {
    return "";
  }

  const separator = fullPath.includes("\\") ? "\\" : "/";
  const parts = fullPath.split(/[\\/]+/).filter(Boolean);
  const visibleParts = parts.slice(-4);
  const suffix = visibleParts.join(separator);

  return parts.length > visibleParts.length
    ? `...${separator}${suffix}`
    : suffix;
}

function parseIgnoredPaths(value) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseExtensions(value) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,|\s+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => (item.startsWith(".") ? item : `.${item}`))
        .filter((item) => /^\.[a-z0-9][a-z0-9._+-]*$/i.test(item)),
    ),
  );
}

function parseSimpleList(value) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

initialRagStateTimeout = window.setTimeout(() => {
  if (initialRagStateLoaded) {
    return;
  }

  releaseRagLoadingWithError(
    "O carregamento inicial do RAG demorou mais que o esperado. A tela foi liberada para você ajustar as configurações.",
  );
}, 10000);

vscode.postMessage({ type: "carregarEstadoRag" });
