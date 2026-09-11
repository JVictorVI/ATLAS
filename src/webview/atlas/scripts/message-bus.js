// Responsabilidade: processa mensagens vindas da extensao para atualizar a UI.
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "erro") {
    if (updateCheckAfterSave) {
      updateCheckAfterSave = false;
      checkingEngineUpdates = false;
      setEngineUpdateStatus(
        typeof message.value === "string"
          ? message.value
          : "Não foi possível salvar o modo selecionado.",
        true,
      );
      updateEngineDownloadActions(false, false);
      updateEngineDeleteButtons();
    }

    releaseAtlasLoading();
    return;
  }

  if (message.type === "configuracoesAtlasCarregadas") {
    applyAtlasSettings(message.value);
    releaseAtlasLoading();
  }

  if (message.type === "configuracoesAtlasSalvas") {
    const shouldDownload = downloadAfterSave;
    const shouldCheckForUpdates = updateCheckAfterSave;
    applyAtlasSettings(message.value);
    releaseAtlasLoading();

    if (shouldDownload) {
      downloadAfterSave = false;
      updateCheckAfterSave = false;
      if (engineDownloadPrompt) {
        engineDownloadPrompt.hidden = false;
      }
      setEngineDownloadStatus("Preparando download da engine selecionada...");
      vscode.postMessage({ type: "baixarEngineConfigurada" });
    } else if (shouldCheckForUpdates) {
      updateCheckAfterSave = false;
      setEngineUpdateStatus("Procurando atualizações da engine...");
      vscode.postMessage({ type: "procurarAtualizacaoEngine" });
    }
  }

  if (message.type === "configuracoesAtlasRestauradas") {
    if (atlasSettingsSaveTimeout) {
      clearTimeout(atlasSettingsSaveTimeout);
      atlasSettingsSaveTimeout = null;
    }

    applyAtlasSettings(message.value);
    releaseAtlasLoading();
  }

  if (message.type === "posicaoAtlasAlterada") {
    setSideBarLocation(message.value?.sideBarLocation);
  }

  if (message.type === "downloadEngineConfiguradaStatus") {
    updateEngineDownloadStatus(message.value);
  }

  if (message.type === "atualizacaoEngineStatus") {
    applyEngineUpdateStatus(message.value);
  }

  if (message.type === "engineModoExecucaoVerificada") {
    applyEngineModeCheck(message.value);
  }

  if (message.type === "engineModoExecucaoExclusaoFinalizada") {
    applyEngineModeDeletionResult(message.value);
  }

  if (
    message.type === "engineLocalSelecionada" &&
    message.value?.error !== true
  ) {
    loadedEngineType = normalizeEngineType(message.value?.engineType);
    setEngineType(loadedEngineType);
    engineUpdateAvailable = false;
    startingEngineUpdate = false;
    setEngineUpdateStatus(
      "Procure atualizações para o modo de processamento selecionado.",
    );

    if (typeof message.value?.engineDownloaded === "boolean") {
      engineDownloadStateByType[loadedEngineType] =
        message.value.engineDownloaded;
    }

    updateEngineDownloadPrompt();
    updateEngineUpdateAction();
  }
});
