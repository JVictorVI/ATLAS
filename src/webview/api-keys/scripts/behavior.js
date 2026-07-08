// Responsabilidade: controla modo de comportamento padrao ou personalizado.
function setupBehaviorSettings() {
  apiKeyElements.toggleDefault?.addEventListener("change", updateBehaviorState);
  apiKeyElements.toggleCustom?.addEventListener("change", updateBehaviorState);
  apiKeyElements.savePromptBtn?.addEventListener(
    "click",
    saveBehaviorSettings,
  );
}

function saveBehaviorSettings() {
  const isCustom = Boolean(apiKeyElements.toggleCustom?.checked);

  vscode.postMessage({
    type: "salvarComportamentoModelo",
    payload: {
      mode: isCustom ? "custom" : "default",
      enabled: isCustom,
      customInstructions: apiKeyElements.systemPrompt?.value || "",
    },
  });
}

function updateBehaviorState() {
  if (apiKeyElements.systemPrompt && apiKeyElements.toggleCustom) {
    apiKeyElements.systemPrompt.disabled = !apiKeyElements.toggleCustom.checked;
  }
}

function applyBehavior(value) {
  const isCustom = value?.mode === "custom" && value?.enabled === true;

  setChecked(apiKeyElements.toggleDefault, !isCustom);
  setChecked(apiKeyElements.toggleCustom, isCustom);

  if (apiKeyElements.systemPrompt) {
    apiKeyElements.systemPrompt.value = value?.customInstructions ?? "";
  }

  updateBehaviorState();
}
