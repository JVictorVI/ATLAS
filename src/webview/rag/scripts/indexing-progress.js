// Responsabilidade: controla estado e barra de progresso da indexacao.
function setIndexingState(indexing) {
  indexingInProgress = indexing;

  if (indexingProgress) {
    indexingProgress.hidden = !indexing;
  }

  if (indexing) {
    resetIndexingProgress();
  }

  if (addProjectButton) {
    addProjectButton.disabled = indexing || externalDocumentsInProgress;
    addProjectButton.textContent = indexing
      ? "Indexando..."
      : "Indexar workspace atual";
  }

  if (selectFolderButton) {
    selectFolderButton.disabled = indexing || externalDocumentsInProgress;
    selectFolderButton.hidden = indexing;
  }

  if (cancelIndexingButton) {
    cancelIndexingButton.hidden = !indexing;
    cancelIndexingButton.disabled = false;
    cancelIndexingButton.textContent = "Cancelar indexação";
  }

  document.querySelectorAll(".project-action-button").forEach((button) => {
    button.disabled = indexing || externalDocumentsInProgress;
  });

  if (addFileButton) {
    addFileButton.disabled = indexing || externalDocumentsInProgress;
  }
}

function setExternalDocumentsState(loading) {
  externalDocumentsInProgress = loading;

  if (!loading && externalIndexingProgress) {
    externalIndexingProgress.hidden = true;
  }

  if (!loading && cancelExternalIndexingButton) {
    cancelExternalIndexingButton.hidden = true;
    cancelExternalIndexingButton.disabled = false;
    cancelExternalIndexingButton.textContent = "Cancelar indexação";
  }

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

  addFileButton.disabled = loading || indexingInProgress;
  addFileButton.textContent = loading ? "Adicionando..." : "Adicionar arquivos";
  if (clearExternalDocumentsButton) {
    clearExternalDocumentsButton.disabled =
      loading || externalDocumentsCount === 0;
  }

  document.querySelectorAll(".document-delete-button").forEach((button) => {
    button.disabled = loading;
  });

  if (addProjectButton) {
    addProjectButton.disabled = loading || indexingInProgress;
  }

  if (selectFolderButton) {
    selectFolderButton.disabled = loading || indexingInProgress;
  }

  document.querySelectorAll(".project-action-button").forEach((button) => {
    button.disabled = loading || indexingInProgress;
  });
}

function setExternalDocumentImportState(importing) {
  const shouldReset = importing && !externalDocumentsInProgress;
  setExternalDocumentsState(importing);

  if (externalIndexingProgress) {
    externalIndexingProgress.hidden = !importing;
  }

  if (cancelExternalIndexingButton) {
    cancelExternalIndexingButton.hidden = !importing;
    cancelExternalIndexingButton.disabled = false;
    cancelExternalIndexingButton.textContent = "Cancelar indexação";
  }

  if (shouldReset) {
    resetExternalIndexingProgress();
  }
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
  const changedFiles = Math.max(0, Number(progress.changedFiles) || 0);
  const skippedFiles = Math.max(0, Number(progress.skippedFiles) || 0);
  const deletedFiles = Math.max(0, Number(progress.deletedFiles) || 0);
  const isIncremental = progress.mode === "incremental";
  let label = "Preparando indexação...";
  let details = "Analisando o projeto...";
  let percentage = null;

  if (phase === "scanning") {
    label = isIncremental ? "Comparando arquivos" : "Analisando arquivos";
    details = `${totalFiles} ${totalFiles === 1 ? "arquivo encontrado" : "arquivos encontrados"}`;
  } else if (phase === "chunking") {
    label = isIncremental ? "Preparando alterações" : "Preparando chunks";
    percentage = calculatePercentage(processedFiles, totalFiles);
    const remainingFiles = Math.max(0, totalFiles - processedFiles);
    details = isIncremental
      ? `${changedFiles} alterados/novos - ${deletedFiles} removidos - ${skippedFiles} sem alterações`
      : `${processedChunks} chunks preparados • ${remainingFiles} ${remainingFiles === 1 ? "arquivo restante" : "arquivos restantes"}`;
  } else if (phase === "embedding") {
    label = isIncremental
      ? "Gerando embeddings incrementais"
      : "Gerando embeddings";
    percentage = calculatePercentage(processedChunks, totalChunks);
    const remainingChunks = Math.max(0, totalChunks - processedChunks);
    details = `${processedChunks} de ${totalChunks} chunks processados • ${remainingChunks} restantes`;
  } else if (phase === "saving") {
    label = isIncremental ? "Aplicando alterações" : "Salvando base vetorial";
    percentage = 100;
    details = isIncremental
      ? `${changedFiles} alterados/novos - ${deletedFiles} removidos`
      : `${totalChunks} chunks processados`;
  } else if (phase === "completed") {
    label = isIncremental
      ? "Atualização incremental concluída"
      : "Indexação concluída";
    percentage = 100;
    details = isIncremental
      ? `${changedFiles} alterados/novos - ${deletedFiles} removidos - ${skippedFiles} sem alterações`
      : `${totalChunks} chunks indexados`;
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

function resetExternalIndexingProgress() {
  if (!externalIndexingProgressTrack || !externalIndexingProgressBar) {
    return;
  }

  externalIndexingProgressTrack.classList.add("is-indeterminate");
  externalIndexingProgressTrack.removeAttribute("aria-valuenow");
  externalIndexingProgressBar.style.width = "";

  if (externalIndexingProgressLabel) {
    externalIndexingProgressLabel.textContent = "Preparando indexação...";
  }

  if (externalIndexingProgressPercent) {
    externalIndexingProgressPercent.textContent = "";
  }

  if (externalIndexingProgressCount) {
    externalIndexingProgressCount.textContent =
      "Aguardando seleção dos arquivos...";
  }

  if (externalIndexingProgressFile) {
    externalIndexingProgressFile.textContent = "";
    externalIndexingProgressFile.title = "";
  }
}

function updateExternalIndexingProgress(progress) {
  if (!externalIndexingProgressTrack || !externalIndexingProgressBar) {
    return;
  }

  const processedFiles = Math.max(0, Number(progress.processedFiles) || 0);
  const totalFiles = Math.max(0, Number(progress.totalFiles) || 0);
  const hasChunkProgress = progress.processedChunks !== undefined;
  const processedChunks = Math.max(0, Number(progress.processedChunks) || 0);
  const completed = totalFiles > 0 && processedFiles >= totalFiles;
  const percentage = hasChunkProgress
    ? null
    : calculatePercentage(processedFiles, totalFiles);
  let label = "Preparando material complementar";
  let details = `${processedFiles} de ${totalFiles} arquivos concluídos`;

  if (hasChunkProgress) {
    label = "Gerando embeddings";
    details = `${processedChunks} chunks processados • ${processedFiles} de ${totalFiles} arquivos concluídos`;
  } else if (completed) {
    label = "Indexação concluída";
    details = `${totalFiles} ${totalFiles === 1 ? "arquivo indexado" : "arquivos indexados"}`;
  }

  if (percentage === null) {
    externalIndexingProgressTrack.classList.add("is-indeterminate");
    externalIndexingProgressTrack.removeAttribute("aria-valuenow");
    externalIndexingProgressBar.style.width = "";
  } else {
    externalIndexingProgressTrack.classList.remove("is-indeterminate");
    externalIndexingProgressTrack.setAttribute(
      "aria-valuenow",
      String(percentage),
    );
    externalIndexingProgressBar.style.width = `${percentage}%`;
  }

  if (externalIndexingProgressLabel) {
    externalIndexingProgressLabel.textContent = label;
  }

  if (externalIndexingProgressPercent) {
    externalIndexingProgressPercent.textContent =
      percentage === null ? "" : `${percentage}%`;
  }

  if (externalIndexingProgressCount) {
    externalIndexingProgressCount.textContent = details;
  }

  if (externalIndexingProgressFile) {
    const currentFile = String(progress.currentFile ?? "");
    externalIndexingProgressFile.textContent = currentFile;
    externalIndexingProgressFile.title = currentFile;
  }
}

function calculatePercentage(processed, total) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}
