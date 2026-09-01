// Responsabilidade: renderiza e sincroniza os perfis de contexto da tela geral.
function applyContextProfileSettings(value) {
  const legacyProfile = {
    mode: normalizeContextProfileMode(value?.contextProfileMode),
    historyWindowSize: value?.contextHistoryWindow,
    includeArchitecturalMemory: value?.contextMemoryEnabled,
    includeRagContext: value?.contextRagEnabled,
    includeEditorContext: value?.contextEditorEnabled,
    maxEditorContextCharacters: value?.contextEditorLimit,
    includeStaticAnalysis: value?.staticAnalysisEnabled,
    ragTopK: value?.contextRagTopK,
    ragMaxContextCharacters: value?.contextRagLimit,
    dynamicContextWindow: value?.dynamicContextWindow,
    staticAnalysisEnabled: value?.staticAnalysisEnabled,
    staticAnalysisQuick: value?.staticAnalysisQuick,
    staticAnalysisArchitectural: value?.staticAnalysisArchitectural,
    staticAnalysisRefactoring: value?.staticAnalysisRefactoring,
    staticAnalysisDiagnostics: value?.staticAnalysisDiagnostics,
    staticAnalysisRelations: value?.staticAnalysisRelations,
  };

  contextProfilesByExecutionMode = Object.fromEntries(
    contextProfileExecutionModes.map((executionMode) => [
      executionMode,
      value?.contextProfiles?.[executionMode] ?? legacyProfile,
    ]),
  );
  customContextProfilesByExecutionMode = Object.fromEntries(
    contextProfileExecutionModes.map((executionMode) => {
      const selectedProfile = getContextProfileForTarget(executionMode);
      const fallbackCustomProfile = {
        ...selectedProfile,
        mode: "custom",
      };

      return [
        executionMode,
        value?.customContextProfiles?.[executionMode] ?? fallbackCustomProfile,
      ];
    }),
  );

  setContextProfileTarget(
    normalizeContextProfileTarget(value?.contextProfileTarget),
  );
  contextProfileExecutionModes.forEach((executionMode) => {
    setContextProfileMode(
      getContextProfileForTarget(executionMode)?.mode,
      executionMode,
    );
  });
  applySelectedContextProfileSettings();
}

function applySelectedContextProfileSettings() {
  const target = getSelectedContextProfileTarget();
  const profile = getContextProfileForTarget(target);
  const mode = normalizeContextProfileMode(profile?.mode);

  setContextProfileMode(mode, target);
  setStaticAnalysisFromSettings(profile);
  renderPresetContextProfileSummaries();
  renderCustomContextProfileSummary(
    getCustomContextProfileForTarget(target),
    target,
  );
  highlightContextProfileSummaries();
  updateStaticAnalysisAvailability();
}

function applyContextProfileSideEffects(profile, target) {
  if (target === "local") {
    setChecked(contextWindowDynamic, profile.dynamicContextWindow !== false);
    setChecked(contextWindowFixed, profile.dynamicContextWindow === false);
  }

  setStaticAnalysisFromProfile(profile);
}

function handleContextProfileChange(event) {
  const target = normalizeContextProfileTarget(
    event?.currentTarget?.dataset?.contextProfileTarget,
  );
  const mode = getSelectedContextProfileMode(target);

  setContextProfileTarget(target);

  if (mode !== "custom") {
    const profile = contextProfilePresets[mode];

    if (profile) {
      contextProfilesByExecutionMode[target] = { ...profile };
      applyContextProfileSideEffects(profile, target);
    }
  } else {
    const customProfile = {
      ...getCustomContextProfileForTarget(target),
      mode: "custom",
    };
    contextProfilesByExecutionMode[target] = customProfile;
    applyContextProfileSideEffects(customProfile, target);
  }

  highlightContextProfileSummaries();
  renderCustomContextProfileSummary(
    getCustomContextProfileForTarget(target),
    target,
  );
  updateStaticAnalysisAvailability();
  saveAtlasSettings({ applyContextProfilePreset: mode !== "custom" });
}

function promoteContextProfileToCustom() {
  const target = getSelectedContextProfileTarget();

  if (getSelectedContextProfileMode(target) === "custom") {
    return;
  }

  const customProfile = {
    ...getCustomContextProfileForTarget(target),
    mode: "custom",
  };
  contextProfilesByExecutionMode[target] = customProfile;
  customContextProfilesByExecutionMode[target] = customProfile;
  setContextProfileMode("custom", target);
  highlightContextProfileSummaries();
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

function getSelectedContextProfileMode(
  target = getSelectedContextProfileTarget(),
) {
  const normalizedTarget = normalizeContextProfileTarget(target);
  const selected = contextProfileInputs.find(
    (input) =>
      input.checked &&
      input.dataset.contextProfileTarget === normalizedTarget,
  );
  return normalizeContextProfileMode(selected?.value);
}

function setContextProfileMode(
  mode,
  target = getSelectedContextProfileTarget(),
) {
  const normalized = normalizeContextProfileMode(mode);
  const normalizedTarget = normalizeContextProfileTarget(target);

  contextProfileInputs.forEach((input) => {
    if (input.dataset.contextProfileTarget === normalizedTarget) {
      input.checked = input.value === normalized;
    }
  });
}

function getSelectedContextProfileTarget() {
  return normalizeContextProfileTarget(activeContextProfileTarget);
}

function setContextProfileTarget(target) {
  activeContextProfileTarget = normalizeContextProfileTarget(target);
}

function normalizeContextProfileTarget(value) {
  return contextProfileExecutionModes.includes(value) ? value : "local";
}

function getContextProfileForTarget(target) {
  return (
    contextProfilesByExecutionMode[normalizeContextProfileTarget(target)] ?? {
      mode: "balanced",
    }
  );
}

function getCustomContextProfileForTarget(target) {
  const normalizedTarget = normalizeContextProfileTarget(target);

  return (
    customContextProfilesByExecutionMode[normalizedTarget] ?? {
      ...getContextProfileForTarget(normalizedTarget),
      mode: "custom",
    }
  );
}

function normalizeContextProfileMode(value) {
  return contextProfileModes.includes(value) ? value : "balanced";
}

function highlightContextProfileSummaries() {
  document
    .querySelectorAll("[data-context-profile-summary]")
    .forEach((item) => {
      const mode = item.getAttribute("data-context-profile-summary");
      const activeEnvironments = contextProfileExecutionModes.filter(
        (executionMode) =>
          getSelectedContextProfileMode(executionMode) === mode,
      );

      item.classList.toggle("is-active", activeEnvironments.length > 0);
      item.dataset.contextProfileEnvironments = activeEnvironments
        .map((executionMode) =>
          executionMode === "local" ? "Local" : "Nuvem",
        )
        .join(" · ");
    });
}

function renderCustomContextProfileSummary(value, target) {
  setText(
    "custom-profile-history",
    `${formatNumber(value?.historyWindowSize ?? 8)} mensagens recentes`,
  );
  setText(
    "custom-profile-memory",
    formatEnabled(value?.includeArchitecturalMemory === true),
  );
  setText(
    "custom-profile-rag",
    value?.includeRagContext === true
      ? `${formatNumber(value?.ragTopK ?? 5)} resultados, até ${formatNumber(value?.ragMaxContextCharacters ?? 10000)} caracteres`
      : "desativado",
  );
  setText(
    "custom-profile-editor",
    value?.includeEditorContext === false
      ? "desativado"
      : `até ${formatNumber(value?.maxEditorContextCharacters ?? 14000)} caracteres`,
  );
  setText(
    "custom-profile-static",
    value?.includeStaticAnalysis === true
      ? describeStaticAnalysis(value)
      : "desativada",
  );
  setText(
    "custom-profile-dynamic",
    target === "local"
      ? formatEnabled(value?.dynamicContextWindow !== false)
      : "não se aplica",
  );
}
