// Responsabilidade: roteia mensagens recebidas da extensao e atualiza a tela.
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

  if (message.type === "cancelamentoIndexacaoRagSolicitado") {
    if (cancelIndexingButton) {
      cancelIndexingButton.disabled = true;
      cancelIndexingButton.textContent = "Cancelando...";
    }
    showFeedback("Cancelamento da indexação solicitado.");
    return;
  }

  if (message.type === "cancelamentoIndexacaoRagRecusado") {
    if (cancelIndexingButton) {
      cancelIndexingButton.disabled = false;
      cancelIndexingButton.textContent = "Cancelar indexação";
    }
    return;
  }

  if (message.type === "cancelamentoIndexacaoRagIndisponivel") {
    setIndexingState(false);
    showFeedback("Nenhuma indexação em andamento para cancelar.", "warning");
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
      showFeedback("Material complementar removido do RAG.");
      return;
    }

    if (message.value?.deletedAll === true) {
      showFeedback("Todos os materiais complementares foram removidos do RAG.");
      return;
    }

    const importedCount = Number(message.value?.importedCount) || 0;
    const skipped = Array.isArray(message.value?.skipped)
      ? message.value.skipped
      : [];

    if (importedCount > 0) {
      showFeedback(
        `${importedCount} ${importedCount === 1 ? "material complementar adicionado" : "materiais complementares adicionados"} ao RAG.`,
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
      showFeedback("Nenhum material complementar foi adicionado.", "warning");
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

  if (message.type === "modeloEmbeddingRagExcluido") {
    showFeedback("Modelo de embeddings excluído.");
    return;
  }

  if (message.type !== "estadoRagCarregado") {
    return;
  }

  setEmbeddingDownloadState(false);

  const settings = message.value?.settings ?? {};
  const runtime = message.value?.runtime ?? {};
  const runtimeStatus = document.getElementById("rag-runtime-status");

  if (ragEnabledInput) {
    ragEnabledInput.checked = settings.enabled === true;
  }

  if (localRagEnabledInput) {
    localRagEnabledInput.checked = settings.allowLocalContext !== false;
  }

  if (cloudRagEnabledInput) {
    cloudRagEnabledInput.checked = settings.allowCloudContext === true;
  }

  updateRagDestinationAvailability();

  if (autoIndexEnabledInput) {
    autoIndexEnabledInput.checked =
      settings.autoIndex === true && settings.promptIndexOnChange !== true;
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

  if (promptIndexOnChangeInput) {
    promptIndexOnChangeInput.checked = settings.promptIndexOnChange === true;
  }

  if (indexOnStartupInput) {
    indexOnStartupInput.checked = settings.indexOnStartup === true;
  }

  if (promptStartupIndexInput) {
    promptStartupIndexInput.checked =
      settings.promptBeforeStartupIndex === true;
  }
  updateStartupIndexPromptAvailability();

  if (indexingModeInput) {
    indexingModeInput.value =
      settings.indexingMode === "full" ? "full" : "incremental";
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
