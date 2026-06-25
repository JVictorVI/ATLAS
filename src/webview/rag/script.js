const vscode = acquireVsCodeApi();
const toast = document.getElementById("toast");
const projectsTable = document.getElementById("projects-table");
const addProjectButton = document.getElementById("add-project");
const selectFolderButton = document.getElementById("select-folder");
const cancelIndexingButton = document.getElementById("cancel-indexing");
let toastTimer;
let indexingInProgress = false;

function showFeedback(message) {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function saveRagSettings() {
  vscode.postMessage({
    type: "salvarConfiguracoesRag",
    payload: {
      enabled: document.getElementById("rag-enabled")?.checked === true,
      allowCloudContext:
        document.getElementById("cloud-rag-enabled")?.checked === true,
    },
  });
}

document.getElementById("rag-enabled")?.addEventListener("change", (event) => {
  showFeedback(event.target.checked ? "RAG habilitado" : "RAG desabilitado");
  saveRagSettings();
});

document
  .getElementById("cloud-rag-enabled")
  ?.addEventListener("change", (event) => {
    showFeedback(
      event.target.checked
        ? "Uso do RAG em nuvem habilitado"
        : "Uso do RAG em nuvem desabilitado",
    );
    saveRagSettings();
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
    showFeedback(message.value ?? "Erro ao processar configuração do RAG.");
    return;
  }

  if (message.type === "progressoIndexacaoRag") {
    if (!indexingInProgress) {
      setIndexingState(true);
    }

    const progress = message.value ?? {};
    const current =
      progress.phase === "embedding"
        ? `${progress.processedChunks}/${progress.totalChunks} chunks`
        : `${progress.processedFiles}/${progress.totalFiles} arquivos`;
    showFeedback(`Indexando: ${current}`);
    return;
  }

  if (message.type === "indexacaoRagConcluida") {
    setIndexingState(false);
    renderProjects(message.value?.projects ?? []);
    showFeedback("Workspace indexado com sucesso.");
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

  if (message.type !== "estadoRagCarregado") {
    return;
  }

  const settings = message.value?.settings ?? {};
  const runtime = message.value?.runtime ?? {};
  const ragEnabled = document.getElementById("rag-enabled");
  const cloudEnabled = document.getElementById("cloud-rag-enabled");
  const runtimeStatus = document.getElementById("rag-runtime-status");

  if (ragEnabled) {
    ragEnabled.checked = settings.enabled === true;
  }

  if (cloudEnabled) {
    cloudEnabled.checked = settings.allowCloudContext === true;
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

  if (runtime.running) {
    showFeedback(`ChromaDB ativo em ${runtime.host}:${runtime.port}`);
  }

  renderProjects(message.value?.projects ?? []);
});

function setIndexingState(indexing) {
  indexingInProgress = indexing;

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
    createCell("Caminho", project.rootPath || "", project.rootPath || ""),
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
    vscode.postMessage({ type: "indexarWorkspaceRag" });
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

vscode.postMessage({ type: "carregarEstadoRag" });
