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
    if (!selectedModelId && loadedModels.length > 0) {
      selectedModelId = loadedModels[0].id;
    }

    if (selectedModelId) {
      selectModel(selectedModelId);
    }
  }

  if (message.type === "modeloParametrosSalvos") {
    showButtonFeedback("btn-save-params", "Salvo!");
  }

  if (message.type === "modeloLocalCarregado") {
    showButtonFeedback("btn-load-model", "Selecionado!");
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
  const select = document.getElementById("model-select");
  select.innerHTML = "";

  if (loadedModels.length === 0) {
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("model-details").classList.add("hidden");
    return;
  }

  // Preenche o dropdown
  loadedModels.forEach(model => {
    const option = document.createElement("option");
    option.value = model.id;
    // Formato: "[1B] gemma-3-1b"
    option.textContent = `[${model.tag}] ${model.name}`; 
    select.appendChild(option);
  });
}

function setupDropdown() {
  const select = document.getElementById("model-select");
  select.addEventListener("change", (e) => {
    selectModel(e.target.value);
  });
}

function selectModel(id) {
  selectedModelId = id;
  const model = loadedModels.find(m => m.id === id);
  if (!model) {
    return;
  }

  document.getElementById("empty-state").classList.add("hidden");
  document.getElementById("model-details").classList.remove("hidden");

  // Sincroniza o valor do dropdown se for chamado via código
  const select = document.getElementById("model-select");
  if (select.value !== id) {
    select.value = id;
  }

  // Atualiza as labels e tags
  document.getElementById("info-tag").textContent = `${model.quant} · ${model.size}`;
  document.getElementById("info-model").textContent = model.id;
  document.getElementById("info-quant").textContent = model.quant;
  document.getElementById("info-date").textContent = model.date;
  document.getElementById("info-file").textContent = model.file;
  document.getElementById("info-size").textContent = model.size;

  // Atualiza os inputs
  document.getElementById("param-gpu").value = model.params.gpu;
  document.getElementById("param-tokens-res").value = model.params.tokensRes;
  document.getElementById("param-temp").value = model.params.temp;
  document.getElementById("param-context").value = model.params.context;
  document.getElementById("param-max-tokens").value = model.params.maxTokens;

  // Atualiza Rádios de Comportamento
  const tDefault = document.getElementById("toggle-default");
  const tCustom = document.getElementById("toggle-custom");
  const textarea = document.getElementById("system-prompt");

  if (model.customPrompt) {
    tDefault.checked = false;
    tCustom.checked = true;
    textarea.disabled = false;
    textarea.value = model.systemPrompt;
  } else {
    tDefault.checked = true;
    tCustom.checked = false;
    textarea.disabled = true;
    textarea.value = "";
  }
}

function setupToggles() {
  const tDefault = document.getElementById("toggle-default");
  const tCustom = document.getElementById("toggle-custom");
  const textarea = document.getElementById("system-prompt");

  if (tDefault) {
    tDefault.addEventListener("change", () => {
      if (tDefault.checked) {
        textarea.disabled = true;
      }
    });
  }

  if (tCustom) {
    tCustom.addEventListener("change", () => {
      if (tCustom.checked) {
        textarea.disabled = false;
        textarea.focus();
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
        customPrompt: document.getElementById("toggle-custom").checked,
        systemPrompt: document.getElementById("system-prompt").value,
      });
    });
  }

  const btnLoad = document.getElementById("btn-load-model");
  if (btnLoad) {
    btnLoad.addEventListener("click", () => {
      if (!selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "loadModelRequest",
        modelId: selectedModelId,
      });
    });
  }
}
