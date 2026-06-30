const vscode = acquireVsCodeApi();

const atlasSettingsPage = document.getElementById("atlas-settings-page");
const atlasLoading = document.getElementById("atlas-loading");
const atlasLanguage = document.getElementById("atlas-language");
const localStreamResponses = document.getElementById("local-stream-responses");
const localEngineTimeout = document.getElementById("local-engine-timeout");
const contextProfileInputs = Array.from(
  document.querySelectorAll('input[name="context-profile"]'),
);
const engineCpu = document.getElementById("engine-cpu");
const engineCuda = document.getElementById("engine-cuda");
const engineVulkan = document.getElementById("engine-vulkan");
const contextWindowDynamic = document.getElementById("context-window-dynamic");
const contextWindowFixed = document.getElementById("context-window-fixed");
const engineStartOnOpen = document.getElementById("engine-start-on-open");
const staticAnalysisEnabled = document.getElementById(
  "static-analysis-enabled",
);
const staticAnalysisQuick = document.getElementById("static-analysis-quick");
const staticAnalysisArchitectural = document.getElementById(
  "static-analysis-architectural",
);
const staticAnalysisDiagnostics = document.getElementById(
  "static-analysis-diagnostics",
);
const staticAnalysisRelations = document.getElementById(
  "static-analysis-relations",
);
const modelsFolderPath = document.getElementById("models-folder-path");
const enginesFolderPath = document.getElementById("engines-folder-path");
const chooseModelsFolder = document.getElementById("choose-models-folder");
const chooseEnginesFolder = document.getElementById("choose-engines-folder");
const openModelsFolder = document.getElementById("open-models-folder");
const openEnginesFolder = document.getElementById("open-engines-folder");
const saveButton = document.getElementById("save-atlas-settings");
let initialAtlasSettingsLoaded = false;
let initialAtlasSettingsTimeout = undefined;

const CONTEXT_PROFILE_PRESETS = {
  light: {
    mode: "light",
    historyWindowSize: 5,
    includeArchitecturalMemory: false,
    includeRagContext: false,
    includeEditorContext: true,
    maxEditorContextCharacters: 6000,
    ragTopK: 2,
    ragMaxContextCharacters: 4000,
    dynamicContextWindow: false,
    staticAnalysis: {
      enabled: false,
      quick: false,
      architectural: false,
      diagnostics: false,
      relations: false,
    },
  },
  balanced: {
    mode: "balanced",
    historyWindowSize: 8,
    includeArchitecturalMemory: true,
    includeRagContext: true,
    includeEditorContext: true,
    maxEditorContextCharacters: 14000,
    ragTopK: 5,
    ragMaxContextCharacters: 10000,
    dynamicContextWindow: true,
    staticAnalysis: {
      enabled: true,
      quick: true,
      architectural: true,
      diagnostics: false,
      relations: false,
    },
  },
  advanced: {
    mode: "advanced",
    historyWindowSize: 12,
    includeArchitecturalMemory: true,
    includeRagContext: true,
    includeEditorContext: true,
    maxEditorContextCharacters: 40000,
    ragTopK: 10,
    ragMaxContextCharacters: 24000,
    dynamicContextWindow: true,
    staticAnalysis: {
      enabled: true,
      quick: true,
      architectural: true,
      diagnostics: true,
      relations: true,
    },
  },
};

window.addEventListener("DOMContentLoaded", () => {
  setAtlasLoading(true);
  saveButton?.addEventListener("click", saveAtlasSettings);
  staticAnalysisEnabled?.addEventListener(
    "change",
    updateStaticAnalysisAvailability,
  );
  contextProfileInputs.forEach((input) => {
    input.addEventListener("change", handleContextProfileChange);
  });
  chooseModelsFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "selecionarPastaModelosLocais" });
  });
  chooseEnginesFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "selecionarPastaEnginesLocais" });
  });
  openModelsFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "openLocalModelsFolder" });
  });
  openEnginesFolder?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPastaEnginesLocais" });
  });
  initialAtlasSettingsTimeout = window.setTimeout(() => {
    if (initialAtlasSettingsLoaded) {
      return;
    }

    releaseAtlasLoading();
  }, 10000);
  vscode.postMessage({ type: "carregarConfiguracoesAtlas" });
});

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "erro") {
    releaseAtlasLoading();
    return;
  }

  if (message.type === "configuracoesAtlasCarregadas") {
    applyAtlasSettings(message.value);
    releaseAtlasLoading();
  }

  if (message.type === "configuracoesAtlasSalvas") {
    applyAtlasSettings(message.value);
    releaseAtlasLoading();
    showSavedFeedback();
  }
});

function setAtlasLoading(loading) {
  document.body.classList.toggle("atlas-loading-active", loading);

  if (atlasLoading) {
    atlasLoading.hidden = !loading;
  }

  if (atlasSettingsPage) {
    atlasSettingsPage.setAttribute("aria-busy", loading ? "true" : "false");

    if (loading) {
      atlasSettingsPage.setAttribute("aria-hidden", "true");
    } else {
      atlasSettingsPage.removeAttribute("aria-hidden");
    }
  }
}

function releaseAtlasLoading() {
  initialAtlasSettingsLoaded = true;
  window.clearTimeout(initialAtlasSettingsTimeout);
  setAtlasLoading(false);
}

function applyAtlasSettings(value) {
  if (atlasLanguage) {
    atlasLanguage.value = value?.language === "en-US" ? "en-US" : "pt-BR";
  }

  if (localStreamResponses) {
    localStreamResponses.checked = value?.localStream !== false;
  }

  if (localEngineTimeout) {
    localEngineTimeout.value = String(value?.localTimeout ?? 30);
  }

  const engineType = ["cuda", "vulkan"].includes(value?.engineType)
    ? value.engineType
    : "cpu";

  if (engineCpu) {
    engineCpu.checked = engineType === "cpu";
  }

  if (engineCuda) {
    engineCuda.checked = engineType === "cuda";
  }

  if (engineVulkan) {
    engineVulkan.checked = engineType === "vulkan";
  }

  const dynamicContextWindow = value?.dynamicContextWindow !== false;

  if (contextWindowDynamic) {
    contextWindowDynamic.checked = dynamicContextWindow;
  }

  if (contextWindowFixed) {
    contextWindowFixed.checked = !dynamicContextWindow;
  }

  if (engineStartOnOpen) {
    engineStartOnOpen.checked = value?.startOnAtlasOpen === true;
  }

  if (staticAnalysisEnabled) {
    staticAnalysisEnabled.checked = value?.staticAnalysisEnabled !== false;
  }

  if (staticAnalysisQuick) {
    staticAnalysisQuick.checked = value?.staticAnalysisQuick !== false;
  }

  if (staticAnalysisArchitectural) {
    staticAnalysisArchitectural.checked =
      value?.staticAnalysisArchitectural !== false;
  }

  if (staticAnalysisDiagnostics) {
    staticAnalysisDiagnostics.checked =
      value?.staticAnalysisDiagnostics === true;
  }

  if (staticAnalysisRelations) {
    staticAnalysisRelations.checked =
      value?.staticAnalysisRelations === true;
  }

  applyContextProfileSettings(value);
  updateStaticAnalysisAvailability();

  if (modelsFolderPath) {
    modelsFolderPath.value = value?.modelsDir || "";
    modelsFolderPath.title = value?.modelsDir || "";
  }

  if (enginesFolderPath) {
    enginesFolderPath.value = value?.enginesDir || "";
    enginesFolderPath.title = value?.enginesDir || "";
  }
}

function saveAtlasSettings() {
  vscode.postMessage({
    type: "salvarConfiguracoesAtlas",
    payload: {
      language: atlasLanguage?.value === "en-US" ? "en-US" : "pt-BR",
      contextProfileMode: getSelectedContextProfileMode(),
      localStream: localStreamResponses?.checked !== false,
      localTimeout: localEngineTimeout?.value
        ? Number(localEngineTimeout.value)
        : undefined,
      engineType: getSelectedEngineType(),
      dynamicContextWindow: contextWindowFixed?.checked !== true,
      startOnAtlasOpen: engineStartOnOpen?.checked === true,
      modelsDir: modelsFolderPath?.value || "",
      enginesDir: enginesFolderPath?.value || "",
      staticAnalysisEnabled: staticAnalysisEnabled?.checked === true,
      staticAnalysisQuick: staticAnalysisQuick?.checked === true,
      staticAnalysisArchitectural:
        staticAnalysisArchitectural?.checked === true,
      staticAnalysisDiagnostics: staticAnalysisDiagnostics?.checked === true,
      staticAnalysisRelations: staticAnalysisRelations?.checked === true,
    },
  });
}

function applyContextProfileSettings(value) {
  const mode = normalizeContextProfileMode(value?.contextProfileMode);

  setContextProfileMode(mode);
  renderCustomContextProfileSummary(value);
  highlightContextProfileSummary(mode);

  if (mode !== "custom") {
    const profile = CONTEXT_PROFILE_PRESETS[mode];
    applyContextProfileSideEffects(profile);
  }
}

function applyContextProfileSideEffects(profile) {
  if (contextWindowDynamic) {
    contextWindowDynamic.checked = profile.dynamicContextWindow !== false;
  }

  if (contextWindowFixed) {
    contextWindowFixed.checked = profile.dynamicContextWindow === false;
  }

  if (staticAnalysisEnabled) {
    staticAnalysisEnabled.checked = profile.staticAnalysis.enabled === true;
  }

  if (staticAnalysisQuick) {
    staticAnalysisQuick.checked = profile.staticAnalysis.quick === true;
  }

  if (staticAnalysisArchitectural) {
    staticAnalysisArchitectural.checked =
      profile.staticAnalysis.architectural === true;
  }

  if (staticAnalysisDiagnostics) {
    staticAnalysisDiagnostics.checked =
      profile.staticAnalysis.diagnostics === true;
  }

  if (staticAnalysisRelations) {
    staticAnalysisRelations.checked = profile.staticAnalysis.relations === true;
  }
}

function handleContextProfileChange() {
  const mode = getSelectedContextProfileMode();

  if (mode !== "custom") {
    const profile = CONTEXT_PROFILE_PRESETS[mode];
    applyContextProfileSideEffects(profile);
  }

  highlightContextProfileSummary(mode);
  updateStaticAnalysisAvailability();
}

function getSelectedContextProfileMode() {
  const selected = contextProfileInputs.find((input) => input.checked);
  return normalizeContextProfileMode(selected?.value);
}

function setContextProfileMode(mode) {
  const normalized = normalizeContextProfileMode(mode);

  contextProfileInputs.forEach((input) => {
    input.checked = input.value === normalized;
  });
}

function normalizeContextProfileMode(value) {
  if (value === "light" || value === "advanced" || value === "custom") {
    return value;
  }

  return "balanced";
}

function highlightContextProfileSummary(mode) {
  document
    .querySelectorAll("[data-context-profile-summary]")
    .forEach((item) => {
      item.classList.toggle(
        "is-active",
        item.getAttribute("data-context-profile-summary") === mode,
      );
    });
}

function renderCustomContextProfileSummary(value) {
  setText(
    "custom-profile-history",
    `${formatNumber(value?.contextHistoryWindow ?? 8)} mensagens recentes`,
  );
  setText(
    "custom-profile-memory",
    formatEnabled(value?.contextMemoryEnabled === true),
  );
  setText(
    "custom-profile-rag",
    value?.contextRagEnabled === true
      ? `${formatNumber(value?.contextRagTopK ?? 5)} resultados, até ${formatNumber(value?.contextRagLimit ?? 10000)} caracteres`
      : "desativado",
  );
  setText(
    "custom-profile-editor",
    value?.contextEditorEnabled === false
      ? "desativado"
      : `até ${formatNumber(value?.contextEditorLimit ?? 14000)} caracteres`,
  );
  setText("custom-profile-static", describeStaticAnalysis(value));
  setText(
    "custom-profile-dynamic",
    formatEnabled(value?.dynamicContextWindow !== false),
  );
}

function describeStaticAnalysis(value) {
  if (value?.staticAnalysisEnabled === false) {
    return "desativada";
  }

  if (
    value?.staticAnalysisDiagnostics === true ||
    value?.staticAnalysisRelations === true
  ) {
    return "completa";
  }

  return "básica";
}

function setText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

function formatEnabled(enabled) {
  return enabled ? "ativada" : "desativada";
}

function formatNumber(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return String(value ?? "");
  }

  return new Intl.NumberFormat("pt-BR").format(parsed);
}

function updateStaticAnalysisAvailability() {
  const enabled = staticAnalysisEnabled?.checked === true;

  if (staticAnalysisQuick) {
    staticAnalysisQuick.disabled = !enabled;
  }

  if (staticAnalysisArchitectural) {
    staticAnalysisArchitectural.disabled = !enabled;
  }

  if (staticAnalysisDiagnostics) {
    staticAnalysisDiagnostics.disabled = !enabled;
  }

  if (staticAnalysisRelations) {
    staticAnalysisRelations.disabled = !enabled;
  }

  document.querySelectorAll(".static-analysis-dependent").forEach((option) => {
    option.classList.toggle("is-disabled", !enabled);
  });
}

function getSelectedEngineType() {
  if (engineCuda?.checked) {
    return "cuda";
  }

  if (engineVulkan?.checked) {
    return "vulkan";
  }

  return "cpu";
}

function showSavedFeedback() {
  if (!saveButton) {
    return;
  }

  const originalText = saveButton.textContent;
  saveButton.textContent = "Salvo!";

  setTimeout(() => {
    saveButton.textContent = originalText;
  }, 1500);
}
