const vscode = acquireVsCodeApi();
const libraryPage = document.getElementById("library-page");
const libraryLoading = document.getElementById("library-loading");
const emptyState = document.getElementById("empty-state");
const defaultEmptyStateMessage =
  emptyState?.textContent?.replace(/\s+/g, " ").trim() ||
  "Nenhum modelo encontrado.";

let loadedModels = [];
let selectedModelId = null;
let currentGpuSliderModel = null;
let initialLibraryModelsLoaded = false;
let initialLibraryModelsTimeout = undefined;

document.addEventListener("DOMContentLoaded", () => {
  setupToggles();
  setupButtons();
  setupDropdown();
  setupGpuSlider();

  initialLibraryModelsTimeout = window.setTimeout(() => {
    if (initialLibraryModelsLoaded) {
      return;
    }

    releaseLibraryLoadingWithMessage(
      "O carregamento inicial da biblioteca demorou mais que o esperado. Verifique as Configurações Gerais e tente abrir a Biblioteca novamente.",
    );
  }, 10000);

  requestModels();
});

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "erro") {
    if (!initialLibraryModelsLoaded) {
      releaseLibraryLoadingWithMessage(
        `Não foi possível carregar a biblioteca: ${message.value ?? "erro desconhecido"}`,
      );
    }

    return;
  }

  if (message.type === "updateModelsList") {
    releaseLibraryLoading();
    setEmptyStateMessage(defaultEmptyStateMessage);
    loadedModels = Array.isArray(message.models) ? message.models : [];
    renderModelDropdown();

    // Se não houver seleção mas tivermos modelos, seleciona o primeiro
    const selectedModelStillExists = loadedModels.some(
      (model) => model.id === selectedModelId,
    );

    if (loadedModels.length === 0) {
      selectedModelId = null;
    } else if (!selectedModelId || !selectedModelStillExists) {
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

function requestModels() {
  vscode.postMessage({ type: "requestModels" });
}

function setLibraryLoading(loading) {
  document.body.classList.toggle("library-loading-active", loading);

  if (libraryLoading) {
    libraryLoading.hidden = !loading;
  }

  if (libraryPage) {
    libraryPage.setAttribute("aria-busy", loading ? "true" : "false");
  }
}

function releaseLibraryLoading() {
  initialLibraryModelsLoaded = true;
  window.clearTimeout(initialLibraryModelsTimeout);
  setLibraryLoading(false);
}

function releaseLibraryLoadingWithMessage(message) {
  releaseLibraryLoading();
  loadedModels = [];
  selectedModelId = null;
  currentGpuSliderModel = null;
  setEmptyStateMessage(message);
  renderModelDropdown();
}

function setEmptyStateMessage(message) {
  if (emptyState) {
    emptyState.textContent = message;
  }
}

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
    requestModels();
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
  configureGpuSlider(model);
  setValue("param-context", model.params.context);
  setValue("param-max-tokens", model.params.maxTokens);
  setValue("param-temp", model.params.temp);
  setValue("param-top-p", model.params.topP);

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

function setupGpuSlider() {
  const slider = document.getElementById("param-gpu");

  slider?.addEventListener("input", () => {
    if (currentGpuSliderModel?.params) {
      currentGpuSliderModel.params.gpu = Number(slider.value) || 0;
    }

    updateGpuSliderLabels(currentGpuSliderModel);
  });
}

function configureGpuSlider(model) {
  currentGpuSliderModel = model;

  const slider = document.getElementById("param-gpu");
  if (!slider) {
    return;
  }

  const totalLayers = getModelLayerCount(model);
  const recommendation = calculateGpuLayerRecommendation(model, totalLayers);
  const savedLayers = Number(model.params?.gpu);

  slider.min = "0";
  slider.max = String(totalLayers);
  slider.step = "1";
  slider.value = String(
    clamp(
      Number.isFinite(savedLayers) ? savedLayers : recommendation.performance,
      0,
      totalLayers,
    ),
  );

  updateGpuSliderLabels(model);
}

function updateGpuSliderLabels(model) {
  const slider = document.getElementById("param-gpu");
  if (!slider || !model) {
    return;
  }

  const totalLayers = getModelLayerCount(model);
  const value = Number(slider.value) || 0;
  const layerBytes = getEstimatedLayerBytes(model, totalLayers);
  const hardware = model.hardware?.gpuMemory;
  const recommendation = calculateGpuLayerRecommendation(model, totalLayers);

  setText(
    "gpu-layer-value",
    value === 0
      ? `Automático (0 de ${totalLayers})`
      : `${value} de ${totalLayers} camadas na GPU`,
  );
  setText(
    "gpu-layer-recommendation",
    hardware
      ? `Seguro: ${recommendation.safe} · Alto desempenho: ${recommendation.performance}`
      : "VRAM não detectada",
  );
  setText(
    "gpu-layer-size",
    value === 0
      ? "0 usa ajuste automático da engine"
      : layerBytes > 0
      ? `Camada estimada: ${formatBytes(layerBytes)}`
      : "Camada: -",
  );
  setText(
    "gpu-vram-total",
    hardware?.label ? `VRAM total: ${hardware.label}` : "VRAM total: -",
  );
}

function calculateGpuLayerRecommendation(model, totalLayers) {
  const hardware = model.hardware?.gpuMemory;
  const layerBytes = getEstimatedLayerBytes(model, totalLayers);

  if (!hardware?.totalBytes || !layerBytes) {
    const fallback = Number(model.params?.gpu) || 0;

    return {
      safe: fallback,
      performance: fallback,
    };
  }

  const safeReserveBytes = Math.max(512 * 1024 ** 2, hardware.totalBytes * 0.14);
  const safeUsableBytes = Math.max(
    0,
    hardware.totalBytes * 0.86 - safeReserveBytes,
  );
  const performanceUsableBytes = Math.max(
    0,
    hardware.totalBytes * 0.94 - 384 * 1024 ** 2,
  );

  return {
    safe: clamp(Math.floor(safeUsableBytes / layerBytes), 0, totalLayers),
    performance: clamp(
      Math.floor(performanceUsableBytes / layerBytes),
      0,
      totalLayers,
    ),
  };
}

function getEstimatedLayerBytes(model, totalLayers) {
  const sizeBytes = Number(model.sizeBytes) || parseSizeToBytes(model.size);

  if (!sizeBytes || !totalLayers) {
    return 0;
  }

  return sizeBytes / totalLayers;
}

function getModelLayerCount(model) {
  const detected = Number(model.layerInfo?.totalLayers);

  if (Number.isFinite(detected) && detected > 0) {
    return detected;
  }

  const label = `${model.name || ""} ${model.tag || ""}`.toLowerCase();
  const match = label.match(/(\d+(?:\.\d+)?)\s*b/);
  const params = match ? Number(match[1]) : 8;

  if (params >= 65) {
    return 80;
  }

  if (params >= 30) {
    return 64;
  }

  if (params >= 13) {
    return 40;
  }

  return 32;
}

function parseSizeToBytes(value) {
  const match = String(value || "")
    .trim()
    .replace(",", ".")
    .match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i);

  if (!match) {
    return 0;
  }

  const units = ["b", "kb", "mb", "gb", "tb"];
  return Number(match[1]) * 1024 ** units.indexOf(match[2].toLowerCase());
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
          contextWindow: parseInt(document.getElementById("param-context").value) || 0,
          maxTokens: parseInt(document.getElementById("param-max-tokens").value) || 0,
          temperature: parseFloat(document.getElementById("param-temp").value) || 0,
          topP: parseFloat(document.getElementById("param-top-p").value) || 0,
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
