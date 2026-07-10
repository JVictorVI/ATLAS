// Responsabilidade: conecta controles da tela a comandos enviados para a extensao.
let ragSettingsSaveTimeout = null;

function scheduleRagSettingsSave(delay = 600) {
  if (ragSettingsSaveTimeout) {
    clearTimeout(ragSettingsSaveTimeout);
  }

  ragSettingsSaveTimeout = setTimeout(() => {
    ragSettingsSaveTimeout = null;
    saveRagSettings();
  }, delay);
}

function registerRagSettingsAutosave() {
  const debouncedInputs = [
    chunkSizeInput,
    chunkOverlapInput,
    maxFileSizeInput,
    debounceInput,
    allowedExtensionsInput,
    relevanceThresholdInput,
    maxChunksPerFileInput,
    languageFiltersInput,
    directoryFiltersInput,
    topKInput,
    contextLimitInput,
    ignoredPathsInput,
  ];
  const instantInputs = [
    indexingModeInput,
    respectGitIgnoreInput,
    markdownFilesInput,
    configFilesInput,
    relevanceModeInput,
    sourcePriorityInput,
    diversifyFilesInput,
    excludeActiveFileInput,
    showSourcesInput,
  ];

  debouncedInputs.forEach((input) => {
    input?.addEventListener("input", () => scheduleRagSettingsSave());
  });

  instantInputs.forEach((input) => {
    input?.addEventListener("change", saveRagSettings);
  });
}

registerRagSettingsAutosave();

ragEnabledInput?.addEventListener("change", () => {
  updateRagDestinationAvailability();
  saveRagSettings();
});

localRagEnabledInput?.addEventListener("change", () => {
  saveRagSettings();
});

cloudRagEnabledInput?.addEventListener("change", () => {
  saveRagSettings();
});

autoIndexEnabledInput?.addEventListener("change", () => {
  if (autoIndexEnabledInput.checked === true && promptIndexOnChangeInput) {
    promptIndexOnChangeInput.checked = false;
  }

  saveRagSettings();
});

promptIndexOnChangeInput?.addEventListener("change", () => {
  if (promptIndexOnChangeInput.checked === true && autoIndexEnabledInput) {
    autoIndexEnabledInput.checked = false;
  }

  saveRagSettings();
});

indexOnStartupInput?.addEventListener("change", () => {
  updateStartupIndexPromptAvailability();
  saveRagSettings();
});

promptStartupIndexInput?.addEventListener("change", () => {
  saveRagSettings();
});

externalDocumentsInput?.addEventListener("change", () => {
  saveRagSettings();
});

externalMaxFileSizeInput?.addEventListener("change", () => {
  saveRagSettings();
});

document.getElementById("add-project")?.addEventListener("click", () => {
  setIndexingState(true);
  vscode.postMessage({
    type: "indexarWorkspaceRag",
    indexingMode: getSelectedIndexingMode(),
  });
});

selectFolderButton?.addEventListener("click", () => {
  setIndexingState(true);
  vscode.postMessage({
    type: "selecionarPastaRag",
    indexingMode: getSelectedIndexingMode(),
  });
});

cancelIndexingButton?.addEventListener("click", () => {
  cancelIndexingButton.disabled = true;
  cancelIndexingButton.textContent = "Confirmando...";
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

