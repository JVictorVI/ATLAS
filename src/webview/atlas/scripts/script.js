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
  engineTypeInputs.forEach((input) => {
    input?.addEventListener("change", () => {
      updateEngineDownloadPrompt();
      scheduleAtlasSettingsSave(0);
    });
  });

  downloadSelectedEngine?.addEventListener("click", downloadCurrentEngineMode);

  staticAnalysisEnabled?.addEventListener("change", () => {
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
}

function bindPostMessageButton(button, type) {
  button?.addEventListener("click", () => {
    vscode.postMessage({ type });
  });
}
