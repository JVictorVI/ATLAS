const vscode = acquireVsCodeApi();

let loadedModels = [];
let selectedModelId = null;

document.addEventListener("DOMContentLoaded", () => {
  setupToggles();
  setupButtons();
  setupDropdown();
  
  vscode.postMessage({ type: "requestModels" });
});

window.addEventListener("message", (event) => {
  const message = event.data;
  
  if (message.type === "updateModelsList") {
    loadedModels = message.models;
    renderModelDropdown();
    
    // Se não houver seleção mas tivermos modelos, seleciona o primeiro
    const selectedModelStillExists = loadedModels.some(
      (model) => model.id === selectedModelId,
    );

    if ((!selectedModelId || !selectedModelStillExists) && loadedModels.length > 0) {
      selectedModelId = loadedModels[0].id;
    }

    if (selectedModelId) {
      selectModel(selectedModelId);
    }
  }

  if (message.type === "modeloParametrosSalvos") {
    showButtonFeedback("btn-save-params", "Salvo!");
  }

  if (message.type === "modeloComportamentoSalvo") {
    showButtonFeedback("btn-save-behavior", "Salvo!");
  }

  if (message.type === "modeloMetadadosSalvos") {
    showButtonFeedback("btn-edit-model", "Salvo!");
  }

  if (message.type === "modeloLocalExcluido") {
    selectedModelId = null;
  }

});

function showButtonFeedback(buttonId, temporaryText) {
  const button = document.getElementById(buttonId);

  if (!button) {
    return;
  }

  const originalText = button.textContent;
  button.textContent = temporaryText;

  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}

function renderModelDropdown() {
  const list = document.getElementById("model-select-list");
  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (loadedModels.length === 0) {
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("model-details").classList.add("hidden");
    return;
  }

  loadedModels.forEach((model) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "model-dropdown-item";
    item.dataset.id = model.id;
    item.innerHTML = `
      <span class="model-option-main">${escapeHtml(model.name)}</span>
      <span class="model-option-meta">${escapeHtml(model.provider || "Local")} · ${escapeHtml(model.quant || "-")} · ${escapeHtml(model.size || "-")}</span>
    `;
    item.addEventListener("click", () => {
      selectModel(model.id);
      list.classList.add("hidden");
    });
    list.appendChild(item);
  });
}

function setupDropdown() {
  const button = document.getElementById("model-select-button");
  const list = document.getElementById("model-select-list");

  button?.addEventListener("click", (e) => {
    e.stopPropagation();
    list?.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    const picker = document.getElementById("model-picker");

    if (picker && !picker.contains(e.target)) {
      list?.classList.add("hidden");
    }
  });
}

function selectModel(id) {
  selectedModelId = id;
  const model = loadedModels.find(m => m.id === id);
  if (!model) {
    return;
  }

  toggleClass("empty-state", "hidden", true);
  toggleClass("model-details", "hidden", false);

  // Sincroniza o valor do dropdown se for chamado via código
  const label = document.getElementById("model-select-label");
  if (label) {
    label.textContent = model.name;
  }

  document.querySelectorAll(".model-dropdown-item").forEach((item) => {
    item.classList.toggle("selected", item.dataset.id === id);
  });

  // Atualiza as labels e tags
  setText("info-tag", `${model.quant} · ${model.size}`);
  setText("info-model", model.name);
  setText("info-provider", model.provider || "Local");
  setText("info-quant", model.quant);
  setText("info-date", model.date);
  setText("info-file", model.file);
  setText("info-size", model.size);

  // Atualiza os inputs
  setValue("param-gpu", model.params.gpu);
  setValue("param-tokens-res", model.params.tokensRes);
  setValue("param-temp", model.params.temp);
  setValue("param-context", model.params.context);
  setValue("param-max-tokens", model.params.maxTokens);

  // Atualiza Rádios de Comportamento
  if (model.customPrompt) {
    setChecked("toggle-default", false);
    setChecked("toggle-custom", true);
    setDisabled("system-prompt", false);
    setValue("system-prompt", model.systemPrompt);
  } else {
    setChecked("toggle-default", true);
    setChecked("toggle-custom", false);
    setDisabled("system-prompt", true);
    setValue("system-prompt", "");
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? "";
  }
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value ?? "";
  }
}

function setChecked(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.checked = value;
  }
}

function setDisabled(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.disabled = value;
  }
}

function toggleClass(id, className, force) {
  const element = document.getElementById(id);
  if (element) {
    element.classList.toggle(className, force);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setupToggles() {
  const tDefault = document.getElementById("toggle-default");
  const tCustom = document.getElementById("toggle-custom");
  const textarea = document.getElementById("system-prompt");

  if (tDefault) {
    tDefault.addEventListener("change", () => {
      if (tDefault.checked) {
        setDisabled("system-prompt", true);
      }
    });
  }

  if (tCustom) {
    tCustom.addEventListener("change", () => {
      if (tCustom.checked) {
        setDisabled("system-prompt", false);
        textarea?.focus();
      }
    });
  }
}

function setupButtons() {
  const btnSave = document.getElementById("btn-save-params");
  if (btnSave) {
    btnSave.addEventListener("click", () => {
      if (!selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "saveModelParams",
        modelId: selectedModelId,
        params: {
          gpuLayers: parseInt(document.getElementById("param-gpu").value) || 0,
          tokensRes: parseInt(document.getElementById("param-tokens-res").value) || 0,
          temperature: parseFloat(document.getElementById("param-temp").value) || 0,
          contextWindow: parseInt(document.getElementById("param-context").value) || 0,
          maxTokens: parseInt(document.getElementById("param-max-tokens").value) || 0,
        },
      });
    });
  }

  const btnSaveBehavior = document.getElementById("btn-save-behavior");
  if (btnSaveBehavior) {
    btnSaveBehavior.addEventListener("click", () => {
      if (!selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "saveModelBehavior",
        modelId: selectedModelId,
        customPrompt: document.getElementById("toggle-custom").checked,
        systemPrompt: document.getElementById("system-prompt").value,
      });
    });
  }

  const btnEditModel = document.getElementById("btn-edit-model");
  if (btnEditModel) {
    btnEditModel.addEventListener("click", () => {
      if (!selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "editModelMetadata",
        modelId: selectedModelId,
      });
    });
  }

  const btnDeleteModel = document.getElementById("btn-delete-model");
  if (btnDeleteModel) {
    btnDeleteModel.addEventListener("click", () => {
      if (!selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "deleteModelRequest",
        modelId: selectedModelId,
      });
    });
  }
}
