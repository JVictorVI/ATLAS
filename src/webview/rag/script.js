const vscode = acquireVsCodeApi();
const projectsTable = document.getElementById("projects-table");
const addProjectButton = document.getElementById("add-project");
const selectFolderButton = document.getElementById("select-folder");
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
const indexingProgressFile = document.getElementById(
  "indexing-progress-file",
);
const topKInput = document.getElementById("rag-top-k");
const contextLimitInput = document.getElementById("rag-context-limit");
const ignoredPathsInput = document.getElementById("rag-ignored-paths");
const chunkSizeInput = document.getElementById("rag-chunk-size");
const chunkOverlapInput = document.getElementById("rag-chunk-overlap");
const maxFileSizeInput = document.getElementById("rag-max-file-size");
const allowedExtensionsInput = document.getElementById(
  "rag-allowed-extensions",
);
const respectGitIgnoreInput = document.getElementById(
  "rag-respect-gitignore",
);
const markdownFilesInput = document.getElementById("rag-markdown-files");
const configFilesInput = document.getElementById("rag-config-files");
const indexOnAddInput = document.getElementById("rag-index-on-add");
const debounceInput = document.getElementById("rag-debounce");
const relevanceModeInput = document.getElementById("rag-relevance-mode");
const relevanceThresholdInput = document.getElementById(
  "rag-relevance-threshold",
);
const maxChunksPerFileInput = document.getElementById(
  "rag-max-chunks-file",
);
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
let indexingInProgress = false;

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
  const autoIndexDebounceMs = Number.parseInt(
    debounceInput?.value ?? "",
    10,
  );
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
    !Number.isInteger(autoIndexDebounceMs) ||
    autoIndexDebounceMs < 500 ||
    autoIndexDebounceMs > 60000
  ) {
    showFeedback(
      "O debounce deve ficar entre 500 e 60.000 ms.",
      "warning",
    );
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
      topK,
      maxContextCharacters,
      ignoredPaths: parseIgnoredPaths(ignoredPathsInput?.value ?? ""),
      chunkSize,
      chunkOverlap,
      maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
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

document
  .getElementById("cloud-rag-enabled")
  ?.addEventListener("change", () => {
    saveRagSettings();
  });

document
  .getElementById("auto-index-enabled")
  ?.addEventListener("change", () => {
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

document.getElementById("add-file")?.addEventListener("click", () => {
  showFeedback("O envio de documentos será implementado em uma próxima etapa.");
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
    showFeedback("Projeto adicionado. Use Reindexar para criar a base vetorial.");
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

  if (message.type === "configuracoesRagSalvas") {
    showFeedback("Configurações do RAG salvas.");
    return;
  }

  if (message.type !== "estadoRagCarregado") {
    return;
  }

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
    contextLimitInput.value = String(
      settings.maxContextCharacters ?? 12000,
    );
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
    relevanceThresholdInput.value = String(
      settings.relevanceThreshold ?? 0.9,
    );
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
});

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
  row.appendChild(
    createCell("Tamanho", formatBytes(project.sizeBytes ?? 0)),
  );

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

  return parts.length > visibleParts.length ? `...${separator}${suffix}` : suffix;
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

vscode.postMessage({ type: "carregarEstadoRag" });
