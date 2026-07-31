// Responsabilidade: aplica valores recebidos, monta payloads e controla autosave.
function registerAtlasSettingsAutosave() {
  atlasDirectAutosaveInputs.forEach((input) => {
    input?.addEventListener("change", saveAtlasSettings);
  });

  localEngineTimeout?.addEventListener("input", () => {
    scheduleAtlasSettingsSave();
  });

  refactoringEnabled?.addEventListener("change", updateStaticAnalysisAvailability);
}

function scheduleAtlasSettingsSave(delay = 600) {
  if (atlasSettingsSaveTimeout) {
    clearTimeout(atlasSettingsSaveTimeout);
  }

  atlasSettingsSaveTimeout = setTimeout(() => {
    atlasSettingsSaveTimeout = null;
    saveAtlasSettings();
  }, delay);
}

function applyAtlasSettings(value) {
  applyContextProfilePresets(value?.contextProfilePresets);

  setInputValue(
    atlasLanguage,
    value?.language === "en-US" ? "en-US" : "pt-BR",
  );
  setChecked(localStreamResponses, value?.localStream !== false);
  setChecked(saveInterruptedResponses, value?.saveInterruptedResponses !== false);
  setInputValue(localEngineTimeout, value?.localTimeout ?? 30);

  loadedEngineType = normalizeEngineType(value?.engineType);
  setEngineType(loadedEngineType);

  setChecked(contextWindowDynamic, value?.dynamicContextWindow !== false);
  setChecked(contextWindowFixed, value?.dynamicContextWindow === false);
  setChecked(engineStartOnOpen, value?.startOnAtlasOpen === true);
  setChecked(enginePrepareOnOpen, value?.prepareOnAtlasOpen !== false);
  setChecked(refactoringEnabled, value?.refactoringEnabled !== false);

  setStaticAnalysisFromSettings(value);
  applyContextProfileSettings(value);
  updateStaticAnalysisAvailability();

  setPathValue(modelsFolderPath, value?.modelsDir);
  setPathValue(enginesFolderPath, value?.enginesDir);
  updateEngineDownloadPrompt();
}

function saveAtlasSettings() {
  if (atlasSettingsSaveTimeout) {
    clearTimeout(atlasSettingsSaveTimeout);
    atlasSettingsSaveTimeout = null;
  }

  vscode.postMessage({
    type: "salvarConfiguracoesAtlas",
    payload: {
      language: atlasLanguage?.value === "en-US" ? "en-US" : "pt-BR",
      contextProfileMode: getSelectedContextProfileMode(),
      localStream: localStreamResponses?.checked !== false,
      saveInterruptedResponses: saveInterruptedResponses?.checked !== false,
      localTimeout: readOptionalNumber(localEngineTimeout),
      engineType: getSelectedEngineType(),
      dynamicContextWindow: contextWindowFixed?.checked !== true,
      startOnAtlasOpen: engineStartOnOpen?.checked === true,
      prepareOnAtlasOpen: enginePrepareOnOpen?.checked !== false,
      refactoringEnabled: refactoringEnabled?.checked !== false,
      modelsDir: modelsFolderPath?.value || "",
      enginesDir: enginesFolderPath?.value || "",
      ...getStaticAnalysisPayload(),
    },
  });
}
