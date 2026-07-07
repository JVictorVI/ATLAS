(() => {
  const app = window.atlasLibrary;
  const { refs, state, ui, vscode } = app;

  function setupToggles() {
    refs.toggleDefault?.addEventListener("change", () => {
      if (refs.toggleDefault.checked) {
        ui.setDisabled("system-prompt", true);
      }
    });

    refs.toggleCustom?.addEventListener("change", () => {
      if (refs.toggleCustom.checked) {
        ui.setDisabled("system-prompt", false);
        refs.systemPrompt?.focus();
      }
    });
  }

  function setupButtons() {
    ui.getById("btn-save-params")?.addEventListener("click", () => {
      if (!state.selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "saveModelParams",
        modelId: state.selectedModelId,
        params: {
          gpuLayers: ui.getIntegerValue("param-gpu"),
          contextWindow: ui.getIntegerValue("param-context"),
          maxTokens: ui.getIntegerValue("param-max-tokens"),
          temperature: ui.getNumberValue("param-temp", parseFloat),
          topP: ui.getNumberValue("param-top-p", parseFloat),
        },
      });
    });

    ui.getById("btn-save-behavior")?.addEventListener("click", () => {
      if (!state.selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "saveModelBehavior",
        modelId: state.selectedModelId,
        customPrompt: ui.getChecked("toggle-custom"),
        systemPrompt: ui.getInputValue("system-prompt"),
      });
    });

    ui.getById("btn-edit-model")?.addEventListener("click", () => {
      if (!state.selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "editModelMetadata",
        modelId: state.selectedModelId,
      });
    });

    ui.getById("btn-delete-model")?.addEventListener("click", () => {
      if (!state.selectedModelId) {
        return;
      }

      vscode.postMessage({
        type: "deleteModelRequest",
        modelId: state.selectedModelId,
      });
    });
  }

  app.controls = {
    setupButtons,
    setupToggles,
  };
})();
