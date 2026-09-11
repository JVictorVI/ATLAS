// Responsabilidade: inicializa a pagina e conecta eventos de usuario.
window.addEventListener("DOMContentLoaded", () => {
  setAtlasLoading(true);
  registerAtlasSettingsAutosave();
  bindAtlasInteractions();

  initialAtlasSettingsTimeout = window.setTimeout(() => {
    if (initialAtlasSettingsLoaded) {
      return;
    }

    releaseAtlasLoading();
  }, 10000);

  vscode.postMessage({ type: "carregarConfiguracoesAtlas" });
});

function bindAtlasInteractions() {
  sideBarLocationInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) {
        return;
      }

      vscode.postMessage({
        type: "alterarPosicaoAtlas",
        location: input.value,
      });
    });
  });

  engineTypeInputs.forEach((input) => {
    input?.addEventListener("change", () => {
      engineUpdateAvailable = false;
      startingEngineUpdate = false;
      setEngineUpdateStatus(
        "Procure atualizações para o modo de processamento selecionado.",
      );
      updateEngineDownloadPrompt();
      updateEngineUpdateAction();
      scheduleAtlasSettingsSave(0);
    });
  });

  downloadSelectedEngine?.addEventListener("click", downloadCurrentEngineMode);
  cancelEngineDownload?.addEventListener(
    "click",
    cancelCurrentEngineDownload,
  );
  checkEngineUpdates?.addEventListener("click", checkCurrentEngineUpdate);
  updateEngineNow?.addEventListener("click", updateCurrentEngineNow);

  engineDeleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestEngineModeDeletion(button.dataset.engineType);
    });
  });

  staticAnalysisEnabled?.addEventListener("change", () => {
    promoteContextProfileToCustom();
    updateStaticAnalysisAvailability();
    saveAtlasSettings();
  });

  contextProfileInputs.forEach((input) => {
    input.addEventListener("change", handleContextProfileChange);
  });

  bindPostMessageButton(chooseModelsFolder, "selecionarPastaModelosLocais");
  bindPostMessageButton(chooseEnginesFolder, "selecionarPastaEnginesLocais");
  bindPostMessageButton(openModelsFolder, "openLocalModelsFolder");
  bindPostMessageButton(openEnginesFolder, "abrirPastaEnginesLocais");
  bindPostMessageButton(
    restoreAtlasDefaults,
    "restaurarConfiguracoesAtlas",
  );
}

function bindPostMessageButton(button, type) {
  button?.addEventListener("click", () => {
    vscode.postMessage({ type });
  });
}
