// Responsabilidade: valida e salva configurações gerais, indexação e recuperação.
function updateStartupIndexPromptAvailability() {
  if (!promptStartupIndexInput) {
    return;
  }

  const enabled = indexOnStartupInput?.checked === true;
  promptStartupIndexInput.disabled = !enabled;
  startupIndexSuboptions?.classList.toggle("is-disabled", !enabled);
  startupIndexSuboptions?.setAttribute(
    "aria-disabled",
    enabled ? "false" : "true",
  );

  if (!enabled) {
    promptStartupIndexInput.checked = false;
  }
}

function saveRagSettings() {
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
      "O tamanho máximo por material complementar deve ficar entre 1 e 250 MB.",
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
      enabled: ragEnabledInput?.checked === true,
      allowLocalContext: localRagEnabledInput?.checked !== false,
      allowCloudContext: cloudRagEnabledInput?.checked === true,
      autoIndex: autoIndexEnabledInput?.checked === true,
      embeddingModel: embeddingModelSelect?.value || undefined,
      topK,
      maxContextCharacters,
      updateContextProfileRecovery: ragRecoverySettingsDirty,
      ignoredPaths: parseIgnoredPaths(ignoredPathsInput?.value ?? ""),
      chunkSize,
      chunkOverlap,
      maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
      externalDocumentMaxFileSizeBytes: externalMaxFileSizeMb * 1024 * 1024,
      allowedExtensions,
      respectGitIgnore: respectGitIgnoreInput?.checked === true,
      includeMarkdownFiles: markdownFilesInput?.checked === true,
      includeConfigFiles: configFilesInput?.checked === true,
      indexingMode: getSelectedIndexingMode(),
      promptIndexOnChange: promptIndexOnChangeInput?.checked === true,
      indexOnStartup: indexOnStartupInput?.checked === true,
      promptBeforeStartupIndex: promptStartupIndexInput?.checked === true,
      autoIndexDebounceMs,
      relevanceMode,
      relevanceThreshold,
      maxChunksPerFile,
      diversifyFiles: diversifyFilesInput?.checked === true,
      excludeActiveFile: excludeActiveFileInput?.checked === true,
      includeExternalDocuments: externalDocumentsInput?.checked === true,
      useInCodeEditing: codeEditingRagInput?.checked === true,
      sourcePriority: sourcePriorityInput?.value ?? "balanced",
      languageFilters: parseSimpleList(languageFiltersInput?.value ?? ""),
      directoryFilters: parseIgnoredPaths(directoryFiltersInput?.value ?? ""),
      showSources: showSourcesInput?.checked === true,
    },
  });

  ragRecoverySettingsDirty = false;
}
