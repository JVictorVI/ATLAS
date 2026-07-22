// Responsabilidade: processa mensagens vindas da extensao para atualizar a UI.
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "erro") {
    releaseAtlasLoading();
    return;
  }

  if (message.type === "configuracoesAtlasCarregadas") {
    applyAtlasSettings(message.value);
    releaseAtlasLoading();
  }

  if (message.type === "configuracoesAtlasSalvas") {
    const shouldDownload = downloadAfterSave;
    applyAtlasSettings(message.value);
    releaseAtlasLoading();

    if (shouldDownload) {
      downloadAfterSave = false;
      if (engineDownloadPrompt) {
        engineDownloadPrompt.hidden = false;
      }
      setEngineDownloadStatus("Preparando download da engine selecionada...");
      vscode.postMessage({ type: "baixarEngineConfigurada" });
    }
  }

  if (message.type === "downloadEngineConfiguradaStatus") {
    updateEngineDownloadStatus(message.value);
  }

  if (message.type === "engineModoExecucaoVerificada") {
    applyEngineModeCheck(message.value);
  }
});
