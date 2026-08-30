// Responsabilidade: aplica valores recebidos, monta payloads e controla autosave.
function registerAtlasSettingsAutosave() {
  atlasDirectAutosaveInputs.forEach((input) => {
    input?.addEventListener("change", () => {
      if (contextProfileManagedInputs.includes(input)) {
        promoteContextProfileToCustom();
      }

      saveAtlasSettings();
    });
  });

  localEngineTimeout?.addEventListener("input", () => {
    scheduleAtlasSettingsSave();
  });

  refactoringEnabled?.addEventListener("change", updateRefactoringAvailability);
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

function updateRefactoringAvailability() {
  const enabled = refactoringEnabled?.checked !== false;

  setInputsDisabled([refactoringModelIntent], !enabled);
  document.querySelectorAll(".refactoring-dependent").forEach((option) => {
    option.classList.toggle("is-disabled", !enabled);
  });

  updateStaticAnalysisAvailability();
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
  setChecked(refactoringModelIntent, value?.refactoringModelIntent === true);

  setStaticAnalysisFromSettings(value);
  applyContextProfileSettings(value);
  updateRefactoringAvailability();

  setPathValue(modelsFolderPath, value?.modelsDir);

  const nextEnginesDir = String(value?.enginesDir || "");

  if (loadedEnginesDir && loadedEnginesDir !== nextEnginesDir) {
    atlasEngineTypes.forEach((engineType) => {
      delete engineDownloadStateByType[engineType];
    });
  }

  loadedEnginesDir = nextEnginesDir;
  setPathValue(enginesFolderPath, nextEnginesDir);

  if (typeof value?.engineDownloaded === "boolean") {
    engineDownloadStateByType[loadedEngineType] = value.engineDownloaded;
  }

  const engineDownloadStatusValue = value?.engineDownloadStatus;
  const engineDownloadStatusMatchesDirectory =
    engineDownloadStatusValue?.enginesDir === nextEnginesDir;
  activeEngineDownloadType =
    engineDownloadStatusMatchesDirectory &&
    engineDownloadStatusValue?.loading === true &&
    atlasEngineTypes.includes(engineDownloadStatusValue?.engineType)
      ? engineDownloadStatusValue.engineType
      : null;
  updateEngineDownloadPrompt();

  if (engineDownloadStatusValue && engineDownloadStatusMatchesDirectory) {
    updateEngineDownloadStatus(engineDownloadStatusValue);
  } else {
    setEngineDownloadStatus("");
  }
}

function saveAtlasSettings(options = {}) {
  if (atlasSettingsSaveTimeout) {
    clearTimeout(atlasSettingsSaveTimeout);
    atlasSettingsSaveTimeout = null;
  }

  vscode.postMessage({
    type: "salvarConfiguracoesAtlas",
    payload: {
      applyContextProfilePreset:
        options.applyContextProfilePreset === true,
      language: atlasLanguage?.value === "en-US" ? "en-US" : "pt-BR",
      contextProfileTarget: getSelectedContextProfileTarget(),
      contextProfileMode: getSelectedContextProfileMode(),
      localStream: localStreamResponses?.checked !== false,
      saveInterruptedResponses: saveInterruptedResponses?.checked !== false,
      localTimeout: readOptionalNumber(localEngineTimeout),
      engineType: getSelectedEngineType(),
      dynamicContextWindow: contextWindowFixed?.checked !== true,
      startOnAtlasOpen: engineStartOnOpen?.checked === true,
      prepareOnAtlasOpen: enginePrepareOnOpen?.checked !== false,
      refactoringEnabled: refactoringEnabled?.checked !== false,
      refactoringModelIntent: refactoringModelIntent?.checked === true,
      modelsDir: modelsFolderPath?.value || "",
      enginesDir: enginesFolderPath?.value || "",
      ...getStaticAnalysisPayload(),
    },
  });
}
