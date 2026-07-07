(() => {
  const refs = {
    libraryPage: document.getElementById("library-page"),
    libraryLoading: document.getElementById("library-loading"),
    emptyState: document.getElementById("empty-state"),
    modelDetails: document.getElementById("model-details"),
    modelPicker: document.getElementById("model-picker"),
    modelSelectButton: document.getElementById("model-select-button"),
    modelSelectLabel: document.getElementById("model-select-label"),
    modelSelectList: document.getElementById("model-select-list"),
    gpuSlider: document.getElementById("param-gpu"),
    gpuLayerValue: document.getElementById("gpu-layer-value"),
    gpuLayerRecommendation: document.getElementById(
      "gpu-layer-recommendation",
    ),
    gpuLayerSize: document.getElementById("gpu-layer-size"),
    gpuVramTotal: document.getElementById("gpu-vram-total"),
    systemPrompt: document.getElementById("system-prompt"),
    toggleDefault: document.getElementById("toggle-default"),
    toggleCustom: document.getElementById("toggle-custom"),
  };

  window.atlasLibrary = {
    vscode: acquireVsCodeApi(),
    refs,
    defaultEmptyStateMessage:
      refs.emptyState?.textContent?.replace(/\s+/g, " ").trim() ||
      "Nenhum modelo encontrado.",
    state: {
      currentGpuSliderModel: null,
      initialized: false,
      initialModelsLoaded: false,
      initialModelsTimeout: undefined,
      loadedModels: [],
      modelById: new Map(),
      selectedModelId: null,
    },
  };
})();
