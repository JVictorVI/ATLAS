// Responsabilidade: renderiza e sincroniza os perfis de contexto da tela geral.
function applyContextProfileSettings(value) {
  const mode = normalizeContextProfileMode(value?.contextProfileMode);

  setContextProfileMode(mode);
  renderCustomContextProfileSummary(value);
  highlightContextProfileSummary(mode);

  if (mode !== "custom") {
    const profile = contextProfilePresets[mode];

    if (profile) {
      applyContextProfileSideEffects(profile);
    }
  }
}

function applyContextProfileSideEffects(profile) {
  setChecked(contextWindowDynamic, profile.dynamicContextWindow !== false);
  setChecked(contextWindowFixed, profile.dynamicContextWindow === false);
  setStaticAnalysisFromProfile(profile);
}

function handleContextProfileChange() {
  const mode = getSelectedContextProfileMode();

  if (mode !== "custom") {
    const profile = contextProfilePresets[mode];

    if (profile) {
      applyContextProfileSideEffects(profile);
    }
  }

  highlightContextProfileSummary(mode);
  updateStaticAnalysisAvailability();
  saveAtlasSettings({ applyContextProfilePreset: mode !== "custom" });
}

function promoteContextProfileToCustom() {
  if (getSelectedContextProfileMode() === "custom") {
    return;
  }

  setContextProfileMode("custom");
  highlightContextProfileSummary("custom");
}

function applyContextProfilePresets(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  const nextPresets = {};

  contextProfilePresetModes.forEach((mode) => {
    const preset = value[mode];

    if (preset && typeof preset === "object") {
      nextPresets[mode] = preset;
    }
  });

  contextProfilePresets = nextPresets;
  renderPresetContextProfileSummaries();
}

function renderPresetContextProfileSummaries() {
  contextProfilePresetModes.forEach((mode) => {
    const preset = contextProfilePresets[mode];
    const summary = document.querySelector(
      `[data-context-profile-summary="${mode}"]`,
    );

    if (!preset || !summary) {
      return;
    }

    setSummaryText(
      summary,
      "history",
      `${formatNumber(preset.historyWindowSize)} mensagens recentes`,
    );
    setSummaryText(
      summary,
      "memory",
      formatEnabled(preset.includeArchitecturalMemory === true),
    );
    setSummaryText(summary, "rag", describePresetRag(preset));
    setSummaryText(summary, "editor", describePresetEditor(preset));
    setSummaryText(summary, "static", describePresetStaticAnalysis(preset));
    setSummaryText(
      summary,
      "dynamic",
      formatEnabled(preset.dynamicContextWindow !== false),
    );
  });
}

function setSummaryText(summary, field, text) {
  setElementText(
    summary.querySelector(`[data-context-profile-field="${field}"]`),
    text,
  );
}

function describePresetRag(preset) {
  if (preset.includeRagContext !== true) {
    return "desativado";
  }

  return `${formatNumber(preset.ragTopK)} resultados, até ${formatNumber(preset.ragMaxContextCharacters)} caracteres`;
}

function describePresetEditor(preset) {
  if (preset.includeEditorContext === false) {
    return "desativado";
  }

  return `até ${formatNumber(preset.maxEditorContextCharacters)} caracteres`;
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
  return contextProfileModes.includes(value) ? value : "balanced";
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
