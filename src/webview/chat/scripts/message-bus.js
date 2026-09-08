// Responsabilidade: processa mensagens recebidas da extensão VS Code.
function isMessageForActiveSession(message) {
  const sessionId = message.sessionId || message.metadata?.sessionId;

  return !sessionId || !activeSessionId || sessionId === activeSessionId;
}

function getMessageGenerationId(message) {
  return message.generationId || message.metadata?.generationId || null;
}

function shouldIgnoreGenerationMessage(message) {
  const generationId = getMessageGenerationId(message);

  return generationId ? cancelledGenerationIds.has(generationId) : false;
}

function clearGenerationForMessage(message) {
  const sessionId = message.sessionId || message.metadata?.sessionId;
  const generationId = getMessageGenerationId(message);
  const previousGeneration = sessionId
    ? activeGenerationSnapshots.get(sessionId)
    : null;

  clearActiveGenerationSnapshot({ sessionId, generationId });

  if (previousGeneration && !activeGenerationSnapshots.has(sessionId)) {
    renderSessionList();
  }
}

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "agenteCarregado": {
      if (message.value) {
        selectedProvider = message.value.provider || "local";
        selectedModel = message.value.model || modelsData["local"].models[0];
        updateMainButton();
        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden")) {
          renderPopoverContent();
        }
      }
      break;
    }

    case "sincronizarChat": {
      vscode.postMessage({ type: "listarSessoes" });
      break;
    }

    case "novaResposta": {
      clearGenerationForMessage(message);

      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      setGenerationState(false);
      clearShortcutLoadingState("architecture-analysis");
      clearShortcutLoadingState("code-edit");
      pendingCodeEditUserMessage = null;
      const responseElement = addMessage(message.value, "bot", true, false);
      appendRagSources(responseElement, message.metadata?.ragSources);
      appendArchitecturalRefactorAction(responseElement, message.metadata);
      break;
    }

    case "respostaParcial": {
      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      const generationId = getMessageGenerationId(message);

      if (message.sessionId) {
        const previousGeneration = activeGenerationSnapshots.get(
          message.sessionId,
        );
        const isSameGeneration =
          !!previousGeneration &&
          (!generationId || previousGeneration.generationId === generationId);

        rememberActiveGeneration({
          sessionId: message.sessionId,
          generationId,
          userContent: isSameGeneration
            ? previousGeneration.userContent
            : "",
          partialContent:
            (isSameGeneration ? previousGeneration.partialContent || "" : "") +
            String(message.value || ""),
          isStreaming: true,
          forcedMode: isSameGeneration
            ? previousGeneration.forcedMode
            : undefined,
        });

        if (!previousGeneration) {
          renderSessionList();
        }
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();

      if (!mensagemAtualBot) {
        bufferResposta = "";

        mensagemAtualBot = addMessage("", "bot", false, false);

        mensagemAtualBot.classList.add("streaming-message");
      }

      bufferResposta += message.value;

      if (!fadeFramePending) {
        fadeFramePending = true;

        requestAnimationFrame(() => {
          try {
            if (mensagemAtualBot) {
              updateMessagePresentation(mensagemAtualBot, bufferResposta, true);

              renderMarkdownContent(mensagemAtualBot, bufferResposta, true);
            }
          } catch {
            if (mensagemAtualBot) {
              mensagemAtualBot.innerText = bufferResposta;
            }
          }

          scrollChatToBottom();

          fadeFramePending = false;
        });
      }

      break;
    }

    case "engineLocalStatus": {
      const engineMessage =
        message.value?.message || "Iniciando a engine local...";

      if (isEngineReadyMessage(engineMessage) && isGeneratingResponse) {
        resetLoadingMessageToDefault();
        break;
      }

      updateLoadingMessage(engineMessage);
      break;
    }
    case "engineControlStatus": {
      isLocalEngineActionRunning = message.value?.loading === true;
      libraryHealth = {
        ...(libraryHealth || {}),
        engineRunning: message.value?.running === true,
      };

      if (currentView === "library") {
        localHealthLoadError = null;
        releaseLocalHealthLoading();
        renderLocalHealthPanel();
      }
      break;
    }
    case "engineLocalSelecionada": {
      const engineType = normalizeLocalEngineType(message.value?.engineType);
      const engineDownloaded = message.value?.engineDownloaded === true;

      isLocalEngineSelectionRunning = false;
      pendingLocalEngineType = null;
      localEngineSelectionError = message.value?.error === true;
      localEngineSelectionMessage = localEngineSelectionError
        ? message.value?.message || "Não foi possível alterar a engine."
        : engineDownloaded
          ? `${formatLocalEngineType(engineType)} selecionada.`
          : `${formatLocalEngineType(engineType)} selecionada. Os arquivos serão preparados ao iniciar.`;
      libraryHealth = {
        ...(libraryHealth || {}),
        engineType,
        engineRunning: localEngineSelectionError
          ? libraryHealth?.engineRunning === true
          : false,
      };

      if (currentView === "library") {
        renderLocalHealthPanel();
      }
      break;
    }

    case "modelosHuggingFaceEncontrados": {
      handleSearchModelsLoaded(message.value);
      break;
    }

    case "statusDownloadModeloHuggingFace": {
      applyDownloadStatus(message.value);
      break;
    }

    case "downloadModeloHuggingFaceConcluido": {
      applyDownloadFinished(message.value);
      break;
    }

    case "mostrarRepositorioHuggingFace": {
      downloadsState.panelOpen = message.showDownloads === true;
      renderSearchView();
      hideSessionsButton();
      closeSessionsSidebar();
      updateActiveTab("search-btn");
      break;
    }

    case "fimResposta": {
      clearGenerationForMessage(message);

      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      if (mensagemAtualBot) {
        mensagemAtualBot.classList.remove("streaming-message");

        updateMessagePresentation(mensagemAtualBot, bufferResposta, true);

        renderMarkdownContent(mensagemAtualBot, bufferResposta, false);
        appendRagSources(mensagemAtualBot, message.metadata?.ragSources);
        appendArchitecturalRefactorAction(mensagemAtualBot, message.metadata);
      }

      mensagemAtualBot = null;
      bufferResposta = "";
      fadeFramePending = false;

      scrollChatToBottom();
      setGenerationState(false);
      clearShortcutLoadingState("architecture-analysis");
      clearShortcutLoadingState("code-edit");

      break;
    }

    case "geracaoCancelada": {
      clearGenerationForMessage(message);

      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      removePendingCodeEditConfirmation(message);
      finishCurrentBotMessage(true);
      clearShortcutLoadingStates();
      break;
    }

    case "erro": {
      pendingSessionId = null;
      clearGenerationForMessage(message);

      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      if (currentView === "library" && isLocalHealthLoading) {
        localHealthLoadError =
          message.value || "Não foi possível carregar o ambiente local.";
        releaseLocalHealthLoading();
        renderLocalHealthPanel();
      }

      if (currentView === "search") {
        handleSearchModelsError(message.value);
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      removePendingCodeEditConfirmation(message);
      mensagemAtualBot = null;
      bufferResposta = "";
      isLoadingCloudModels = false;
      cloudModelLoadError = null;
      setGenerationState(false);
      fadeFramePending = false;
      clearShortcutLoadingStates();
      //addMessage(message.value || "Ocorreu um erro.", "bot");
      break;
    }
    case "analiseRapidaStatus": {
      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      const isLoading = !!message.value?.loading;
      const isQuickAnalysisFromChat =
        message.value?.source === "chat" || message.value?.source === "button";

      if (isQuickAnalysisFromChat) {
        if (isLoading) {
          const generationId = getMessageGenerationId(message);

          if (message.sessionId) {
            rememberActiveGeneration({
              sessionId: message.sessionId,
              generationId,
              forcedMode: "quick-analysis",
            });
            renderSessionList();
          }
        } else {
          clearGenerationForMessage(message);
        }
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      shortcutLoadingState.quickAnalysis = isLoading;
      setShortcutLoading("quick-analysis", isLoading);

      if (isQuickAnalysisFromChat && isLoading) {
        if (!loadingElement) {
          showLoading("Analisando");
        }

        setGenerationState(true);
        setLoadingDefaultMessage("Analisando");
      } else if (!isLoading && !hasActiveShortcutLoading()) {
        setGenerationState(false);
      }
      break;
    }
    case "analiseRapidaConcluida": {
      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      const isQuickAnalysisFromChat =
        message.value?.source === "chat" || message.value?.source === "button";

      if (isQuickAnalysisFromChat) {
        clearGenerationForMessage(message);

        if (!isMessageForActiveSession(message)) {
          break;
        }

        removeLoading();
        mensagemAtualBot = null;
        bufferResposta = "";
        fadeFramePending = false;
        setGenerationState(false);
      }

      clearShortcutLoadingState("quick-analysis");
      break;
    }
    case "edicaoCodigoAguardandoConfirmacao": {
      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      const generationId = getMessageGenerationId(message);

      if (message.sessionId) {
        rememberActiveGeneration({
          sessionId: message.sessionId,
          generationId,
          pendingCodeEditConfirmation: message.value,
        });
        renderSessionList();
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      shortcutLoadingState.codeEdit = true;
      renderPendingCodeEditConfirmation(message.value, {
        sessionId: message.sessionId,
        generationId,
      });
      setGenerationState(true);
      break;
    }
    case "edicaoCodigoConfirmacaoRecebida": {
      if (
        shouldIgnoreGenerationMessage(message) ||
        !isMessageForActiveSession(message)
      ) {
        break;
      }

      updatePendingCodeEditConfirmation(message);
      break;
    }
    case "edicaoCodigoStatus": {
      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      const isLoading = !!message.value?.loading;

      if (isLoading) {
        const generationId = getMessageGenerationId(message);

        if (message.sessionId) {
          rememberActiveGeneration({
            sessionId: message.sessionId,
            generationId,
            forcedMode:
              message.value?.source === "architectural-analysis"
                ? "architecture-code-edit"
                : "code-edit",
          });
          renderSessionList();
        }
      } else {
        clearGenerationForMessage(message);
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      shortcutLoadingState.codeEdit = isLoading;

      if (!isLoading) {
        removePendingCodeEditConfirmation(message);
      }

      if (isLoading) {
        const statusMessage =
          message.value?.message || "Aplicando alteração no código...";

        if (!loadingElement) {
          showLoading(statusMessage);
        }

        setLoadingDefaultMessage(statusMessage);
        setGenerationState(true);
      } else if (!hasActiveShortcutLoading()) {
        removeLoading();
        clearShortcutLoadingState("code-edit");
        setGenerationState(false);
      }
      break;
    }
    case "edicaoCodigoCancelada": {
      clearGenerationForMessage(message);

      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      removePendingCodeEditConfirmation(message);
      removePendingCodeEditUserMessage();
      clearShortcutLoadingState("code-edit");
      setGenerationState(false);
      break;
    }
    case "edicaoCodigoConcluida": {
      clearGenerationForMessage(message);

      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      removePendingCodeEditConfirmation(message);
      clearShortcutLoadingState("code-edit");
      pendingCodeEditUserMessage = null;
      setGenerationState(false);
      break;
    }
    case "disponibilidadeMarcacoesAnaliseRapida": {
      hasEditorContextForAnalysis = message.value?.hasEditorContext === true;
      const clearQuickAnalysisBtn = document.getElementById(
        "clear-quick-analysis-btn",
      );

      clearQuickAnalysisBtn?.classList.toggle(
        "hidden",
        message.value?.available !== true,
      );
      hydrateChatControlState();
      break;
    }
    case "informarLLMsCarregados": {
      isRefreshingModelCatalog = false;
      hydratemodelsDataFromBackend(message.value);
      break;
    }
    case "updateModelsList": {
      libraryModels = message.models || [];
      modelsData.local.models = libraryModels.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        provider: model.provider || "Local",
        enabled: model.enabled !== false,
      }));
      configuredLocalModelId = message.selectedLocalModelId || null;

      if (selectedMode === "local") {
        selectedModel =
          modelsData.local.models.find(
            (model) => model.id === configuredLocalModelId,
          ) || null;
        updateMainButton();
      }
      libraryHealth = message.health || null;
      localHealthLoadError = null;
      releaseLocalHealthLoading();

      if (currentView === "library") {
        renderLocalHealthPanel();
      }
      break;
    }
    case "modelosCloudCarregados": {
      const { providerId, models } = message.value;
      if (modelsData[providerId]) {modelsData[providerId].models = models;}
      isLoadingCloudModels = false;
      cloudModelLoadError = null;
      if (selectedMode === "cloud" && selectedProvider === providerId) {
        selectedModel =
          models.find((model) => model.id === configuredCloudModelId) || null;
        updateMainButton();
        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden"))
          {renderPopoverContent();}
      }
      break;
    }
    case "modoSelecionado": {
      if (message.value?.mode === "local") {
        configuredLocalModelId = message.value.selectedLocalModelId || null;
        selectedModel =
          (modelsData.local?.models || []).find(
            (model) => model.id === configuredLocalModelId,
          ) || null;
        updateMainButton();
      }
      break;
    }
    case "modelosCloudErro": {
      const { providerId, message: errorMessage } = message.value || {};

      if (!providerId || selectedProvider === providerId) {
        isLoadingCloudModels = false;
        cloudModelLoadError =
          errorMessage || "Não foi possível carregar modelos deste provedor.";
        selectedModel = null;
        updateMainButton();

        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden")) {
          renderPopoverContent();
        }
      }
      break;
    }

    // ── Session messages ────────────────────────────────────────────────────

    case "sessoesListadas": {
      pendingSessionId = null;
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.activeSessionId;
      const activeGenerations =
        message.value.activeGenerations ||
        (message.value.activeGeneration
          ? [message.value.activeGeneration]
          : []);
      rememberActiveGenerations(
        activeGenerations,
      );

      // If no active session exists yet, auto-create one
      if (!activeSessionId && activeSessions.length === 0) {
        vscode.postMessage({
          type: "criarSessao",
          title: "Nova Sessão",
          autoTitle: true,
        });
        return;
      }

      renderSessionList();

      if (message.value.activeSession) {
        loadChatMessages(
          message.value.activeSession,
          activeGenerations,
        );
      }
      break;
    }

    case "sessaoCriada": {
      pendingSessionId = null;
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      const activeGenerations = message.value.activeGenerations || [];
      rememberActiveGenerations(activeGenerations);
      renderSessionList();
      loadChatMessages(message.value.session, activeGenerations);
      break;
    }

    case "sessaoTrocada": {
      if (
        pendingSessionId &&
        message.value?.session?.id &&
        message.value.session.id !== pendingSessionId
      ) {
        break;
      }

      pendingSessionId = null;
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      const activeGenerations = message.value.activeGenerations || [];
      rememberActiveGenerations(activeGenerations);
      renderSessionList();
      loadChatMessages(message.value.session, activeGenerations);
      break;
    }

    case "sessaoExcluida": {
      pendingSessionId = null;
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.activeSession?.id || null;
      const activeGenerations = message.value.activeGenerations || [];
      rememberActiveGenerations(activeGenerations);
      renderSessionList();
      if (message.value.activeSession) {
        loadChatMessages(
          message.value.activeSession,
          activeGenerations,
        );
      } else {
        vscode.postMessage({
          type: "criarSessao",
          title: "Nova Sessão",
          autoTitle: true,
        });
      }
      break;
    }

    case "sessaoRenomeada": {
      activeSessions = message.value.sessions || [];
      renderSessionList();
      break;
    }

    case "sessoesAtualizadas": {
      activeSessions = message.value || [];
      renderSessionList();
      break;
    }
  }
});
