// Responsabilidade: renderiza modelos de embedding e controles de download/refresh.
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
