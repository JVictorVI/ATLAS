// Responsabilidade: processa mensagens recebidas da extensao VS Code.
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

  if (generationId && generationId === activeGenerationId) {
    activeGenerationId = null;
  }

  if (sessionId && sessionId === activeGenerationSessionId) {
    activeGenerationSessionId = null;
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
      const responseElement = addMessage(message.value, "bot", true, false);
      appendRagSources(responseElement, message.metadata?.ragSources);
      break;
    }

    case "respostaParcial": {
      if (shouldIgnoreGenerationMessage(message)) {
        break;
      }

      const generationId = getMessageGenerationId(message);

      if (generationId) {
        activeGenerationId = generationId;
      }

      if (
        message.sessionId &&
        message.sessionId !== activeGenerationSessionId
      ) {
        activeGenerationSessionId = message.sessionId;
        renderSessionList();
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

    case "modelosHuggingFaceEncontrados": {
      handleSearchModelsLoaded(message.value);
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
      }

      mensagemAtualBot = null;
      bufferResposta = "";
      fadeFramePending = false;

      scrollChatToBottom();
      setGenerationState(false);
      clearShortcutLoadingState("architecture-analysis");

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
      const isLoading = !!message.value?.loading;
      const isQuickAnalysisFromChat =
        message.value?.source === "chat" || message.value?.source === "button";
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
        const prevId = selectedModel?.id;
        selectedModel =
          models.find((m) => m.id === prevId) || models[0] || null;
        updateMainButton();
        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden"))
          {renderPopoverContent();}
      }
      break;
    }
    case "modelosCloudErro": {
      const { providerId, message: errorMessage } = message.value || {};

      if (!providerId || selectedProvider === providerId) {
        isLoadingCloudModels = false;
        cloudModelLoadError =
          errorMessage || "Nao foi possivel carregar modelos deste provedor.";
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
      activeGenerationSessionId =
        message.value.activeGeneration?.sessionId || null;

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
          message.value.activeGeneration,
        );
      }
      break;
    }

    case "sessaoCriada": {
      pendingSessionId = null;
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      activeGenerationSessionId =
        message.value.activeGeneration?.sessionId || null;
      renderSessionList();
      loadChatMessages(message.value.session, message.value.activeGeneration);
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
      activeGenerationSessionId =
        message.value.activeGeneration?.sessionId || null;
      renderSessionList();
      loadChatMessages(message.value.session, message.value.activeGeneration);
      break;
    }

    case "sessaoExcluida": {
      pendingSessionId = null;
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.activeSession?.id || null;
      activeGenerationSessionId =
        message.value.activeGeneration?.sessionId || null;
      renderSessionList();
      if (message.value.activeSession) {
        loadChatMessages(
          message.value.activeSession,
          message.value.activeGeneration,
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

    case "modoEstudoAtualizado": {
      applyStudyModeState(message.value?.enabled === true);
      break;
    }
  }
});
