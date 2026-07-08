// Responsabilidade: centraliza referencias DOM, estado da tela e notificacoes.
const vscode = acquireVsCodeApi();
const ragPage = document.getElementById("rag-page");
const ragLoading = document.getElementById("rag-loading");
const projectsTable = document.getElementById("projects-table");
const addProjectButton = document.getElementById("add-project");
const selectFolderButton = document.getElementById("select-folder");
const addFileButton = document.getElementById("add-file");
const clearExternalDocumentsButton = document.getElementById(
  "clear-external-documents",
);
const externalDocumentsList = document.getElementById(
  "external-documents-list",
);
const externalMaxFileSizeInput = document.getElementById(
  "rag-external-max-file-size",
);
const cancelIndexingButton = document.getElementById("cancel-indexing");
const indexingProgress = document.getElementById("indexing-progress");
const indexingProgressLabel = document.getElementById(
  "indexing-progress-label",
);
const indexingProgressPercent = document.getElementById(
  "indexing-progress-percent",
);
const indexingProgressTrack = document.getElementById(
  "indexing-progress-track",
);
const indexingProgressBar = document.getElementById("indexing-progress-bar");
const indexingProgressCount = document.getElementById(
  "indexing-progress-count",
);
const indexingProgressFile = document.getElementById("indexing-progress-file");
const topKInput = document.getElementById("rag-top-k");
const contextLimitInput = document.getElementById("rag-context-limit");
const ignoredPathsInput = document.getElementById("rag-ignored-paths");
const ragEnabledInput = document.getElementById("rag-enabled");
const localRagEnabledInput = document.getElementById("local-rag-enabled");
const cloudRagEnabledInput = document.getElementById("cloud-rag-enabled");
const autoIndexEnabledInput = document.getElementById("auto-index-enabled");
const ragDestinationSuboptions = document.querySelector(
  ".rag-destination-suboptions",
);
const chunkSizeInput = document.getElementById("rag-chunk-size");
const chunkOverlapInput = document.getElementById("rag-chunk-overlap");
const maxFileSizeInput = document.getElementById("rag-max-file-size");
const allowedExtensionsInput = document.getElementById(
  "rag-allowed-extensions",
);
const respectGitIgnoreInput = document.getElementById("rag-respect-gitignore");
const markdownFilesInput = document.getElementById("rag-markdown-files");
const configFilesInput = document.getElementById("rag-config-files");
const promptIndexOnChangeInput = document.getElementById(
  "rag-prompt-index-on-change",
);
const indexOnStartupInput = document.getElementById("rag-index-on-startup");
const promptStartupIndexInput = document.getElementById(
  "rag-prompt-startup-index",
);
const startupIndexSuboptions = document.querySelector(
  ".startup-index-suboptions",
);
const indexingModeInput = document.getElementById("rag-indexing-mode");
const debounceInput = document.getElementById("rag-debounce");
const relevanceModeInput = document.getElementById("rag-relevance-mode");
const relevanceThresholdInput = document.getElementById(
  "rag-relevance-threshold",
);
const maxChunksPerFileInput = document.getElementById("rag-max-chunks-file");
const sourcePriorityInput = document.getElementById("rag-source-priority");
const languageFiltersInput = document.getElementById("rag-language-filters");
const directoryFiltersInput = document.getElementById("rag-directory-filters");
const diversifyFilesInput = document.getElementById("rag-diversify-files");
const excludeActiveFileInput = document.getElementById(
  "rag-exclude-active-file",
);
const externalDocumentsInput = document.getElementById(
  "rag-external-documents",
);
const showSourcesInput = document.getElementById("rag-show-sources");
const embeddingModelsFolderInput = document.getElementById(
  "embedding-models-folder-path",
);
const chooseEmbeddingModelsFolderButton = document.getElementById(
  "choose-embedding-models-folder",
);
const openEmbeddingModelsFolderButton = document.getElementById(
  "open-embedding-models-folder",
);
const downloadDefaultEmbeddingModelButton = document.getElementById(
  "download-default-embedding-model",
);
const embeddingDefaultModelAction = document.getElementById(
  "embedding-default-model-action",
);
const embeddingModelGrid = document.getElementById("embedding-model-grid");
const embeddingModelSelect = document.getElementById("rag-embedding-model");
const embeddingModelStatus = document.getElementById("embedding-model-status");
let indexingInProgress = false;
let externalDocumentsInProgress = false;
let externalDocumentsCount = 0;
let embeddingModelsRefreshInProgress = false;
let initialRagStateLoaded = false;
let initialRagStateTimeout = undefined;

function showFeedback(message, level = "info") {
  if (!message) {
    return;
  }

  vscode.postMessage({
    type: "mostrarNotificacaoRag",
    message,
    level,
  });
}

function getSelectedIndexingMode() {
  return indexingModeInput?.value === "full" ? "full" : "incremental";
}
