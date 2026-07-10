// Responsabilidade: carrega, salva e habilita os parametros de execucao em nuvem.
let cloudConfigSaveTimeout = null;
let isApplyingCloudConfig = false;

function setupCloudConfigEvents() {
  const numericInputs = [
    apiKeyElements.maxTokens,
    apiKeyElements.timeout,
    apiKeyElements.temperature,
    apiKeyElements.topP,
  ];
  const toggleInputs = [
    apiKeyElements.limitPayload,
    apiKeyElements.dynamicMaxTokens,
    apiKeyElements.stream,
  ];

  numericInputs.forEach((input) => {
    input?.addEventListener("input", () => scheduleCloudConfigAutosave());
  });

  toggleInputs.forEach((input) => {
    input?.addEventListener("change", handleCloudConfigToggleChange);
  });

  apiKeyElements.limitPayload?.addEventListener("change", deactivateInputs);
  apiKeyElements.dynamicMaxTokens?.addEventListener(
    "change",
    deactivateInputs,
  );
}

function fillCloudConfigs(settings) {
  if (!settings) {
    return;
  }

  isApplyingCloudConfig = true;
  setChecked(apiKeyElements.limitPayload, settings.limitPayload);
  setChecked(apiKeyElements.dynamicMaxTokens, settings.dynamicMaxTokens === true);
  setChecked(apiKeyElements.stream, settings.stream);
  setInputValue(apiKeyElements.maxTokens, settings.maxTokens);
  setInputValue(apiKeyElements.timeout, settings.timeout);
  setInputValue(apiKeyElements.temperature, settings.temperature);
  setInputValue(apiKeyElements.topP, settings.topP);
  isApplyingCloudConfig = false;
}

function saveCloudConfigs() {
  const {
    dynamicMaxTokens,
    limitPayload,
    maxTokens,
    stream,
    temperature,
    timeout,
    topP,
  } = apiKeyElements;

  vscode.postMessage({
    type: "salvarConfiguracoesCloud",
    payload: {
      limitPayload: Boolean(limitPayload?.checked),
      dynamicMaxTokens: Boolean(dynamicMaxTokens?.checked),
      maxTokens: readOptionalNumber(maxTokens),
      timeout: readOptionalNumber(timeout),
      temperature: readOptionalNumber(temperature),
      topP: readOptionalNumber(topP),
      stream: stream ? Boolean(stream.checked) : undefined,
    },
  });
}

function handleCloudConfigToggleChange() {
  deactivateInputs();
  scheduleCloudConfigAutosave(0);
}

function scheduleCloudConfigAutosave(delay = 500) {
  if (isApplyingCloudConfig) {
    return;
  }

  if (cloudConfigSaveTimeout) {
    clearTimeout(cloudConfigSaveTimeout);
  }

  cloudConfigSaveTimeout = setTimeout(() => {
    cloudConfigSaveTimeout = null;
    saveCloudConfigs();
  }, delay);
}

function deactivateInputs() {
  const { dynamicMaxTokens, limitPayload, maxTokens } = apiKeyElements;
  const inputs = [
    apiKeyElements.timeout,
    apiKeyElements.temperature,
    apiKeyElements.topP,
  ];
  const enabled = Boolean(limitPayload?.checked);
  const usesDynamicMaxTokens = Boolean(dynamicMaxTokens?.checked);

  inputs.forEach((input) => {
    if (input) {
      input.disabled = !enabled;
    }
  });

  if (maxTokens) {
    maxTokens.disabled = !enabled || usesDynamicMaxTokens;
  }
}
