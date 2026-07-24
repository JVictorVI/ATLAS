// Responsabilidade: mantem constantes, estado global e preferencias persistidas da tela.
const vscode = acquireVsCodeApi();
const MODEL_FILTER_STORAGE_KEY = "atlas.huggingFaceModelFilter";
const SEARCH_REQUEST_TIMEOUT_MS = 35000;
const MODEL_FILTERS = ["all", "llm", "embedding"];
const MODEL_LIST_PAGE_SIZE = 25;

function normalizeModelFilter(value) {
  return MODEL_FILTERS.includes(value) ? value : "llm";
}

function getSavedModelFilter() {
  try {
    return normalizeModelFilter(
      window.localStorage.getItem(MODEL_FILTER_STORAGE_KEY),
    );
  } catch {
    return "llm";
  }
}

function saveModelFilter(value) {
  try {
    window.localStorage.setItem(
      MODEL_FILTER_STORAGE_KEY,
      normalizeModelFilter(value),
    );
  } catch {
    // localStorage can be unavailable in restricted webview contexts.
  }
}

const state = {
  query: "",
  models: [],
  modelFilter: getSavedModelFilter(),
  currentPage: 1,
  hasNextPage: false,
  selectedModel: null,
  selectedFileName: "",
  detailOnly: false,
  loading: false,
  detailsLoading: false,
  hardwareLoading: false,
  downloading: false,
  variantMenuOpen: false,
  error: "",
  detailsError: "",
  hardwareError: "",
  hardware: null,
};

const root = document.getElementById("model-detail-view");
let searchRequestTimer = undefined;
let searchRequestId = 0;

if (typeof marked !== "undefined") {
  marked.setOptions({
    gfm: true,
    breaks: true,
  });
}
