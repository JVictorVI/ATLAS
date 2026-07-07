(() => {
  const app = window.atlasLibrary;
  const { controls, gpu, models, state, ui } = app;

  function initializeLibrary() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;
    controls.setupToggles();
    controls.setupButtons();
    models.setupDropdown();
    gpu.setupGpuSlider();

    state.initialModelsTimeout = window.setTimeout(() => {
      if (state.initialModelsLoaded) {
        return;
      }

      models.releaseLibraryLoadingWithMessage(
        "O carregamento inicial da biblioteca demorou mais que o esperado. Verifique as Configurações Gerais e tente abrir a Biblioteca novamente.",
      );
    }, 10000);

    models.requestModels();
  }

  function handleMessage(event) {
    const message = event.data || {};

    switch (message.type) {
      case "erro":
        if (!state.initialModelsLoaded) {
          models.releaseLibraryLoadingWithMessage(
            `Não foi possível carregar a biblioteca: ${message.value ?? "erro desconhecido"}`,
          );
        }
        break;

      case "updateModelsList":
        models.handleModelsUpdate(message);
        break;

      case "modeloParametrosSalvos":
        ui.showButtonFeedback("btn-save-params", "Salvo!");
        break;

      case "modeloComportamentoSalvo":
        ui.showButtonFeedback("btn-save-behavior", "Salvo!");
        break;

      case "modeloMetadadosSalvos":
        ui.showButtonFeedback("btn-edit-model", "Salvo!");
        break;

      case "modeloLocalExcluido":
        state.selectedModelId = null;
        state.currentGpuSliderModel = null;
        break;

      default:
        break;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLibrary, {
      once: true,
    });
  } else {
    initializeLibrary();
  }

  window.addEventListener("message", handleMessage);
})();
