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
    addProjectButton.disabled = indexing;
    addProjectButton.textContent = indexing
      ? "Indexando..."
      : "Indexar workspace atual";
  }

  if (selectFolderButton) {
    selectFolderButton.disabled = indexing;
    selectFolderButton.hidden = indexing;
  }

  if (cancelIndexingButton) {
    cancelIndexingButton.hidden = !indexing;
    cancelIndexingButton.disabled = false;
    cancelIndexingButton.textContent = "Cancelar indexação";
  }

  document.querySelectorAll(".project-action-button").forEach((button) => {
    button.disabled = indexing;
  });
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

function calculatePercentage(processed, total) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}
