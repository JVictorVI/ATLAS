// Responsabilidade: renderiza projetos indexados e suas acoes.
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
    empty.textContent = "Nenhum projeto indexado";
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
  reindexButton.className = "btn btn-outline project-action-button";
  reindexButton.type = "button";
  reindexButton.textContent = "Reindexar";
  reindexButton.disabled = indexingInProgress;
  reindexButton.addEventListener("click", () => {
    setIndexingState(true);
    vscode.postMessage({
      type: "reindexarProjetoRag",
      projectId: project.projectId,
      indexingMode: getSelectedIndexingMode(),
    });
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "btn btn-danger project-action-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Excluir";
  deleteButton.disabled = indexingInProgress;
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
