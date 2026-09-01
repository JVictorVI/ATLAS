// Responsabilidade: envia perguntas, controla geração, loading e mensagens.
function createGenerationId() {
  generationSequence += 1;
  return `generation-${Date.now()}-${generationSequence}`;
}

function beginGeneration(sessionId = activeSessionId, generation = {}) {
  activeGenerationId = createGenerationId();
  activeGenerationSessionId = sessionId || null;

  if (activeGenerationSessionId) {
    rememberActiveGeneration({
      sessionId: activeGenerationSessionId,
      generationId: activeGenerationId,
      userContent: generation.userContent || "",
      partialContent: "",
      isStreaming: generation.isStreaming === true,
      forcedMode: generation.forcedMode,
    });
    renderSessionList();
  }

  return activeGenerationId;
}

function rememberCancelledGeneration(generationId) {
  if (!generationId) {
    return;
  }

  cancelledGenerationIds.add(generationId);

  if (cancelledGenerationIds.size > 20) {
    const oldestGenerationId = cancelledGenerationIds.values().next().value;
    cancelledGenerationIds.delete(oldestGenerationId);
  }
}

function setupChatEvents() {
  const input = document.getElementById("pergunta");
  const btn = document.getElementById("send-btn");
  const popoverBtn = document.getElementById("open-popover");
  const agentPopover = document.getElementById("agent-popover");
  const quickAnalysisBtn = document.getElementById("quick-analysis-btn");
  const clearQuickAnalysisBtn = document.getElementById(
    "clear-quick-analysis-btn",
  );
  const architetureAnalysisBtn = document.getElementById(
    "architeture-analysis-btn",
  );
  bindChatScrollTracking();

  if (!input || !btn) {return;}

  if (popoverBtn && agentPopover) {
    popoverBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (agentPopover.classList.contains("hidden")) {
        requestLatestLlmState();
        agentPopover.classList.remove("hidden");
        renderPopoverContent();
      } else {
        agentPopover.classList.add("hidden");
      }
    });
  }

  quickAnalysisBtn?.addEventListener("click", () => {
    if (hasActiveShortcutLoading() || isGeneratingResponse) {return;}
    if (!hasEditorContextForAnalysis) {
      return;
    }
    shortcutLoadingState.quickAnalysis = true;
    const generationId = beginGeneration(activeSessionId, {
      forcedMode: "quick-analysis",
    });
    hydrateChatControlState();
    vscode.postMessage({
      type: "executarAnaliseRapida",
      sessionId: activeSessionId,
      generationId,
    });
  });

  clearQuickAnalysisBtn?.addEventListener("click", () => {
    vscode.postMessage({ type: "limparMarcacoesAnaliseRapida" });
  });

  if (architetureAnalysisBtn) {
    architetureAnalysisBtn.addEventListener("click", () => {
      if (hasActiveShortcutLoading() || isGeneratingResponse) {
        return;
      }

      if (!hasEditorContextForAnalysis) {
        return;
      }

      shortcutLoadingState.architectureAnalysis = true;
      setShortcutLoading("architecture-analysis", true);
      const generationId = beginGeneration(activeSessionId, {
        forcedMode: "architectural-analysis",
      });
      showLoading();

      vscode.postMessage({
        type: "enviarPergunta",
        sessionId: activeSessionId,
        generationId,
        forcedMode: "architectural-analysis",
        value: "Realize uma análise arquitetural deste código.",
        selectedView: currentView,
        agentId: selectedModel ? selectedModel.id : null,
      });
    });
  }

  function enviarPergunta() {
    if (isGeneratingResponse) {
      cancelarGeracao();
      return;
    }

    const texto = input.value.trim();
    if (!texto) {return;}
    const generationId = beginGeneration(activeSessionId, {
      userContent: texto,
    });
    addMessage(texto, "user");
    showLoading();

    vscode.postMessage({
      type: "enviarPergunta",
      sessionId: activeSessionId,
      generationId,
      value: texto,
      selectedView: currentView,
      agentId: selectedModel ? selectedModel.id : null,
    });

    input.value = "";
    resizeChatInput(input);
    agentPopover?.classList.add("hidden");
  }

  btn.addEventListener("click", enviarPergunta);
  input.addEventListener("input", () => resizeChatInput(input));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarPergunta();
    }
  });
  resizeChatInput(input);
  hydrateChatControlState();
}

function cancelarGeracao() {
  if (!isGeneratingResponse) {return;}

  const activeGeneration = activeSessionId
    ? activeGenerationSnapshots.get(activeSessionId)
    : null;
  const generationId = activeGeneration?.generationId || null;
  const sessionId = activeGeneration?.sessionId || activeSessionId;

  rememberCancelledGeneration(generationId);

  vscode.postMessage({
    type: "cancelarGeracao",
    sessionId,
    generationId,
  });

  clearActiveGenerationSnapshot({ sessionId, generationId });
  renderSessionList();
  removeLoading();
  finishCurrentBotMessage(true);
  clearShortcutLoadingStates();
}

function shouldUseWideMessage(content) {
  const text = String(content || "");
  const lines = text.split(/\r?\n/);
  const longestLineLength = lines.reduce(
    (longest, line) => Math.max(longest, line.length),
    0,
  );

  return (
    text.length > 700 ||
    lines.length > 12 ||
    longestLineLength > 95 ||
    /```|^\s{0,3}\|.+\||^\s{0,3}#{1,4}\s|^\s{0,3}>\s/m.test(text)
  );
}

function updateMessagePresentation(element, content, isMarkdown = false) {
  if (!element) {
    return;
  }

  element.classList.toggle("message-markdown", isMarkdown);
  element.classList.toggle("message-wide", shouldUseWideMessage(content));
}

function renderMarkdownContent(element, content, includeCursor = false) {
  try {
    const html =
      typeof marked !== "undefined" ? marked.parse(content) : String(content);
    element.innerHTML =
      html + (includeCursor ? "<span class='cursor'></span>" : "");
  } catch (e) {
    element.innerText = String(content) + (includeCursor ? " █" : "");
  }
}

function addMessage(content, type, isMarkdown = false, forceScroll = true) {
  const chatContainer = getChatContainer();
  if (!chatContainer) {return null;}
  const div = document.createElement("div");
  div.className = "message " + type;
  updateMessagePresentation(div, content, isMarkdown);

  if (isMarkdown) {
    renderMarkdownContent(div, content);
  } else {
    div.textContent = content;
  }
  chatContainer.appendChild(div);
  scrollChatToBottom(forceScroll);
  return div;
}

function appendRagSources(messageElement, sources) {
  if (!messageElement || !Array.isArray(sources) || !sources.length) {
    return;
  }

  messageElement.querySelector(".rag-sources")?.remove();
  const details = document.createElement("details");
  details.className = "rag-sources";
  const summary = document.createElement("summary");
  summary.textContent = `Fontes RAG utilizadas (${sources.length})`;
  details.appendChild(summary);
  const list = document.createElement("ul");

  sources.forEach((source) => {
    const item = document.createElement("li");
    const location =
      source.startLine && source.endLine
        ? `${source.relativePath}:${source.startLine}-${source.endLine}`
        : source.relativePath;
    const relevance = Number.isFinite(source.relevance)
      ? ` · relevância ${(source.relevance * 100).toFixed(1)}%`
      : "";
    item.textContent = `${location}${relevance}`;
    list.appendChild(item);
  });

  details.appendChild(list);
  messageElement.appendChild(details);
}

function appendArchitecturalRefactorAction(messageElement, metadata) {
  if (
    !messageElement ||
    metadata?.mode !== "architectural-analysis" ||
    metadata?.refactorable !== true ||
    !metadata?.refactorContext
  ) {
    return;
  }

  messageElement.querySelector(".message-actions")?.remove();

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action-btn";
  button.title = "Aplicar refatoração guiada pela análise arquitetural";
  button.innerHTML =
    '<i class="codicon codicon-tools" aria-hidden="true"></i><span>Refatorar com base nesta análise</span>';

  button.addEventListener("click", () => {
    if (hasActiveShortcutLoading() || isGeneratingResponse) {
      return;
    }

    const generationId = beginGeneration(activeSessionId, {
      forcedMode: "architecture-code-edit",
      userContent: "Refatorar com base na análise arquitetural anterior.",
    });
    shortcutLoadingState.codeEdit = true;
    pendingCodeEditUserMessage = addMessage(
      "Refatorar com base na análise arquitetural anterior.",
      "user",
    );
    showLoading("Refatorando");
    setGenerationState(true);

    vscode.postMessage({
      type: "executarRefatoracaoArquitetural",
      sessionId: activeSessionId,
      generationId,
      analysisGenerationId: metadata.generationId,
    });
  });

  actions.appendChild(button);
  messageElement.appendChild(actions);
}

function appendInterruptedStatus(messageElement, interrupted) {
  if (!messageElement || interrupted !== true) {
    return;
  }

  const status = document.createElement("div");

  status.className = "message-status";
  status.textContent = "Resposta interrompida.";

  messageElement.appendChild(status);
}

function showLoading(message = "Pensando") {
  const chatContainer = getChatContainer();
  if (!chatContainer) {return;}
  loadingDefaultMessage = message;
  const div = document.createElement("div");
  div.className = "message bot loading";
  const text = document.createElement("span");
  text.className = "thinking-word";
  text.textContent = message;
  text.dataset.text = message;

  div.appendChild(text);
  chatContainer.appendChild(div);
  scrollChatToBottom(true);
  loadingElement = div;
  setGenerationState(true);
}

function updateLoadingMessage(message) {
  if (!loadingElement) {
    return;
  }

  const text = loadingElement.querySelector("span");
  if (text) {
    text.textContent = message;
    text.dataset.text = message;
  }
}

function setLoadingDefaultMessage(message) {
  loadingDefaultMessage = message;
  updateLoadingMessage(message);
}

function resetLoadingMessageToDefault() {
  updateLoadingMessage(loadingDefaultMessage);
}

function isEngineReadyMessage(message) {
  return String(message || "")
    .trim()
    .toLowerCase()
    .startsWith("engine local pronta");
}

function removeLoading() {
  const chatContainer = getChatContainer();
  if (
    loadingElement &&
    chatContainer &&
    loadingElement.parentNode === chatContainer
  ) {
    chatContainer.removeChild(loadingElement);
  }
  loadingElement = null;
  loadingDefaultMessage = "Pensando";
}

function removePendingCodeEditUserMessage() {
  if (!pendingCodeEditUserMessage) {
    return;
  }

  pendingCodeEditUserMessage.remove();
  pendingCodeEditUserMessage = null;
}

function setGenerationState(isGenerating) {
  isGeneratingResponse = isGenerating;

  const sendBtn = document.getElementById("send-btn");
  const input = document.getElementById("pergunta");

  if (sendBtn) {
    sendBtn.classList.toggle("stop", isGenerating);
    sendBtn.title = isGenerating ? "Interromper" : "Enviar";
    sendBtn.innerHTML = isGenerating
      ? '<i class="codicon codicon-debug-stop"></i>'
      : '<i class="codicon codicon-arrow-up"></i>';
  }

  if (input) {
    input.disabled = isGenerating;
  }

  renderShortcutButtons();
}

function hasActiveShortcutLoading() {
  return (
    shortcutLoadingState.quickAnalysis ||
    shortcutLoadingState.architectureAnalysis ||
    shortcutLoadingState.codeEdit
  );
}

function hydrateChatControlState() {
  if (currentView !== "chat") {
    return;
  }

  const hasShortcutLoading = hasActiveShortcutLoading();

  if (shortcutLoadingState.quickAnalysis && !loadingElement) {
    showLoading("Analisando");
  }

  if (shortcutLoadingState.codeEdit && !loadingElement) {
    showLoading("Refatorando");
  }

  setGenerationState(isGeneratingResponse || hasShortcutLoading);
  setShortcutLoading("quick-analysis", shortcutLoadingState.quickAnalysis);
  setShortcutLoading(
    "architecture-analysis",
    shortcutLoadingState.architectureAnalysis,
  );
}

function clearShortcutLoadingStates() {
  shortcutLoadingState.quickAnalysis = false;
  shortcutLoadingState.architectureAnalysis = false;
  shortcutLoadingState.codeEdit = false;
  hydrateChatControlState();
}

function clearShortcutLoadingState(action) {
  if (action === "quick-analysis") {
    shortcutLoadingState.quickAnalysis = false;
  }

  if (action === "architecture-analysis") {
    shortcutLoadingState.architectureAnalysis = false;
  }

  if (action === "code-edit") {
    shortcutLoadingState.codeEdit = false;
  }

  hydrateChatControlState();
}

function finishCurrentBotMessage(cancelled = false) {
  fadeFramePending = false;

  if (mensagemAtualBot) {
    mensagemAtualBot.classList.remove("streaming-message");

    updateMessagePresentation(mensagemAtualBot, bufferResposta, true);

    const finalText = bufferResposta.trim();

    if (finalText) {
      renderMarkdownContent(mensagemAtualBot, finalText, false);
    }

    if (cancelled) {
      const status = document.createElement("div");

      status.className = "message-status";
      status.textContent = "Resposta interrompida.";

      mensagemAtualBot.appendChild(status);
    }
  } else if (cancelled) {
    addMessage("Resposta interrompida.", "bot", false, false);
  }

  mensagemAtualBot = null;
  bufferResposta = "";
  loadingDefaultMessage = "Pensando";

  scrollChatToBottom();
  setGenerationState(false);
}

// ── Config / Library views ────────────────────────────────────────────────────
