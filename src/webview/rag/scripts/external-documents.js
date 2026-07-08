// Responsabilidade: renderiza e gerencia materiais complementares do RAG.
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
    empty.textContent = "Nenhum material complementar adicionado";
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
  title.textContent = documentInfo.name || "Material complementar";
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
