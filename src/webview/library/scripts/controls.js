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

    refs.advancedSettingsToggle?.addEventListener("click", () => {
      state.advancedSettingsExpanded = !state.advancedSettingsExpanded;
      refs.advancedSettingsToggle.setAttribute(
        "aria-expanded",
        state.advancedSettingsExpanded ? "true" : "false",
      );
      refs.advancedSettingsContent?.setAttribute(
        "aria-hidden",
        state.advancedSettingsExpanded ? "false" : "true",
      );
      refs.advancedSettingsContent?.toggleAttribute(
        "inert",
        !state.advancedSettingsExpanded,
      );
      refs.advancedSettingsContent?.classList.toggle(
        "is-expanded",
        state.advancedSettingsExpanded,
      );
      refs.advancedSettingsToggle.classList.toggle(
        "is-expanded",
        state.advancedSettingsExpanded,
      );
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
          threads: Math.max(0, ui.getIntegerValue("param-threads")),
          batchSize: Math.max(0, ui.getIntegerValue("param-batch-size")),
          microBatchSize: Math.max(
            0,
            ui.getIntegerValue("param-micro-batch-size"),
          ),
          flashAttention: ui.getInputValue("param-flash-attention"),
          kvCacheType: ui.getInputValue("param-kv-cache-type"),
          loadMode: ui.getInputValue("param-load-mode"),
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
