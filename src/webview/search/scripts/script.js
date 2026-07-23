// Responsabilidade: escolhe o fluxo inicial da tela ao carregar o webview.
const initialSearchModelId =
  typeof window.__ATLAS_INITIAL_SEARCH_MODEL_ID__ === "string"
    ? window.__ATLAS_INITIAL_SEARCH_MODEL_ID__.trim()
    : "";

if (initialSearchModelId) {
  showModelDetails(initialSearchModelId);
} else {
  searchModels("");
}

requestRepositoryHardware();
