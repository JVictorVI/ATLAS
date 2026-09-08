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
    if (!hasValidModelSelection()) {return;}
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

      if (!hasValidModelSelection()) {
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

    if (!hasValidModelSelection()) {
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
  removePendingCodeEditConfirmation();
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
  button.className = "message-action-btn architecture-refactor-action";
  button.title = "Aplicar refatoração guiada pela análise arquitetural";
  button.innerHTML =
    '<i class="codicon codicon-tools" aria-hidden="true"></i><span>Refatorar com base nesta análise</span>';

  button.addEventListener("click", () => {
    if (hasActiveShortcutLoading() || isGeneratingResponse) {
      return;
    }

    if (!hasValidModelSelection()) {
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

function renderPendingCodeEditConfirmation(confirmation, context = {}) {
  const chatContainer = getChatContainer();

  if (!chatContainer || !confirmation) {
    return null;
  }

  removePendingCodeEditConfirmation();

  const card = document.createElement("div");
  card.className = "message bot code-edit-confirmation";
  card.dataset.sessionId = context.sessionId || "";
  card.dataset.generationId = context.generationId || "";
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", "Confirmar edição de código");

  const heading = document.createElement("div");
  heading.className = "code-edit-confirmation-heading";
  heading.innerHTML =
    '<i class="codicon codicon-diff" aria-hidden="true"></i><strong>Revisar alteração</strong>';
  card.appendChild(heading);

  const description = document.createElement("p");
  description.textContent =
    "O diff está aberto. Revise a prévia e escolha o que deseja fazer.";
  card.appendChild(description);

  if (confirmation.summary) {
    const summary = document.createElement("p");
    summary.className = "code-edit-confirmation-summary";
    summary.textContent = confirmation.summary;
    card.appendChild(summary);
  }

  const details = document.createElement("div");
  details.className = "code-edit-confirmation-details";
  const riskLabels = {
    low: "baixo",
    medium: "médio",
    high: "alto",
  };
  const editCount = Number(confirmation.editCount) || 0;
  details.textContent = `${confirmation.targetFile || "Arquivo atual"} · ${editCount} ${editCount === 1 ? "edição" : "edições"} · risco ${riskLabels[confirmation.risk] || "não informado"}`;
  card.appendChild(details);

  const status = document.createElement("div");
  status.className = "code-edit-confirmation-status";
  status.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "code-edit-confirmation-actions";
  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "code-edit-confirmation-button primary";
  applyButton.innerHTML =
    '<i class="codicon codicon-check" aria-hidden="true"></i><span>Aplicar</span>';
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "code-edit-confirmation-button secondary";
  cancelButton.innerHTML =
    '<i class="codicon codicon-close" aria-hidden="true"></i><span>Cancelar</span>';

  const respond = (approved) => {
    if (card.dataset.responded === "true") {
      return;
    }

    card.dataset.responded = "true";
    applyButton.disabled = true;
    cancelButton.disabled = true;
    status.textContent = approved
      ? "Aplicando alterações..."
      : "Cancelando edição...";
    vscode.postMessage({
      type: "responderConfirmacaoEdicaoCodigo",
      sessionId: context.sessionId,
      generationId: context.generationId,
      approved,
    });
  };

  applyButton.addEventListener("click", () => respond(true));
  cancelButton.addEventListener("click", () => respond(false));
  actions.append(applyButton, cancelButton);
  card.append(actions, status);
  chatContainer.appendChild(card);
  pendingCodeEditConfirmationElement = card;
  scrollChatToBottom(true);

  return card;
}

function updatePendingCodeEditConfirmation(message) {
  const card = pendingCodeEditConfirmationElement;

  if (!card) {
    return;
  }

  const messageGenerationId = getMessageGenerationId(message);

  if (
    (message.sessionId && card.dataset.sessionId !== message.sessionId) ||
    (messageGenerationId &&
      card.dataset.generationId !== messageGenerationId)
  ) {
    return;
  }

  if (message.sessionId) {
    rememberActiveGeneration({
      sessionId: message.sessionId,
      generationId: messageGenerationId,
      pendingCodeEditConfirmation: null,
    });
  }

  card.dataset.responded = "true";
  card
    .querySelectorAll(".code-edit-confirmation-button")
    .forEach((button) => {
      button.disabled = true;
    });
  const status = card.querySelector(".code-edit-confirmation-status");

  if (status) {
    status.textContent =
      message.value?.message || "A escolha foi recebida pelo ATLAS.";
    status.classList.toggle("error", message.value?.accepted !== true);
  }
}

function removePendingCodeEditConfirmation(message = {}) {
  const card = pendingCodeEditConfirmationElement;

  if (!card) {
    return;
  }

  const messageGenerationId = getMessageGenerationId(message);

  if (
    (message.sessionId && card.dataset.sessionId !== message.sessionId) ||
    (messageGenerationId &&
      card.dataset.generationId !== messageGenerationId)
  ) {
    return;
  }

  card.remove();
  pendingCodeEditConfirmationElement = null;
}

function setGenerationState(isGenerating) {
  isGeneratingResponse = isGenerating;

  const sendBtn = document.getElementById("send-btn");
  const input = document.getElementById("pergunta");

  if (sendBtn) {
    const hasValidModel = hasValidModelSelection();
    sendBtn.classList.toggle("stop", isGenerating);
    sendBtn.disabled = !isGenerating && !hasValidModel;
    sendBtn.title = isGenerating
      ? "Interromper"
      : hasValidModel
        ? "Enviar"
        : getInvalidModelSelectionMessage();
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
  const blocksModelActions =
    isGeneratingResponse || hasShortcutLoading || !hasValidModelSelection();

  if (shortcutLoadingState.quickAnalysis && !loadingElement) {
    showLoading("Analisando");
  }

  if (
    shortcutLoadingState.codeEdit &&
    !loadingElement &&
    !pendingCodeEditConfirmationElement
  ) {
    showLoading("Refatorando");
  }

  setGenerationState(isGeneratingResponse || hasShortcutLoading);
  setShortcutLoading("quick-analysis", shortcutLoadingState.quickAnalysis);
  setShortcutLoading(
    "architecture-analysis",
    shortcutLoadingState.architectureAnalysis,
  );

  document
    .querySelectorAll(".architecture-refactor-action")
    .forEach((button) => {
      button.disabled = blocksModelActions;
      button.title = !hasValidModelSelection()
        ? getInvalidModelSelectionMessage()
        : "Aplicar refatoração guiada pela análise arquitetural";
    });
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
