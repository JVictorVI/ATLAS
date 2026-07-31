// Responsabilidade: controla sidebar, lista de sessões, renomeação e troca de conversa.
const sidebar = document.getElementById("chat-sidebar");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const expandSidebarBtn = document.getElementById("expand-sidebar-btn");
const newChatBtn = document.getElementById("new-chat-btn");

toggleSidebarBtn?.addEventListener("click", () => {
  sidebar.classList.add("collapsed");
  expandSidebarBtn.classList.remove("hidden");
});

expandSidebarBtn?.addEventListener("click", () => {
  sidebar.classList.remove("collapsed");
  expandSidebarBtn.classList.add("hidden");
});

newChatBtn?.addEventListener("click", () => {
  vscode.postMessage({
    type: "criarSessao",
    title: "Nova Sessão",
    autoTitle: true,
  });

  // fecha automaticamente a sidebar
  sidebar.classList.add("collapsed");
  expandSidebarBtn.classList.remove("hidden");
});

function renderSessionList() {
  const sessionList = document.getElementById("session-list");
  if (!sessionList) {return;}

  // Keep any pending new-session input
  const pendingInput = sessionList.querySelector(".session-new-input");

  sessionList.innerHTML = "";
  if (pendingInput) {sessionList.appendChild(pendingInput);}

  activeSessions.forEach((session) => {
    const isGenerating = session.id === activeGenerationSessionId;
    const isPending = session.id === pendingSessionId;
    const li = document.createElement("li");
    li.className = `session-item${session.id === activeSessionId ? " active" : ""}${isGenerating ? " generating" : ""}${isPending ? " loading-session" : ""}`;
    li.dataset.id = session.id;

    const icon = session.hasArchitecturalSummary
      ? "codicon-history"
      : "codicon-comment-discussion";
    const msgCount =
      session.messageCount > 0
        ? `<span class="session-count">${session.messageCount}</span>`
        : "";
    const generationIndicator = isGenerating
      ? `<span class="session-loading" title="Resposta em geração"><span class="spinner small"></span></span>`
      : "";

    const pendingIndicator =
      isPending && !isGenerating
        ? `<span class="session-loading" title="Carregando sessão"><span class="spinner small"></span></span>`
        : "";

    li.innerHTML = `
      <i class="codicon ${icon} session-icon"></i>
      <span class="session-label" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
      ${generationIndicator}
      ${pendingIndicator}
      ${msgCount}
      <div class="session-actions">
        <button class="session-action-btn rename-btn" title="Renomear" data-id="${session.id}">
          <i class="codicon codicon-edit"></i>
        </button>
        <button class="session-action-btn delete-btn" title="Excluir" data-id="${session.id}">
          <i class="codicon codicon-trash"></i>
        </button>
      </div>
    `;

    li.addEventListener("click", (e) => {
      if (e.target.closest(".session-action-btn")) {return;}
      if (session.id !== activeSessionId) {
        pendingSessionId = session.id;
        renderSessionList();
        showSessionSwitchLoading();
        vscode.postMessage({ type: "trocarSessao", sessionId: session.id });
      }
    });

    li.querySelector(".rename-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      startInlineRename(li, session);
    });

    li.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: "excluirSessao", sessionId: session.id });
    });
    sessionList.appendChild(li);
  });
}

function startInlineRename(li, session) {
  const labelEl = li.querySelector(".session-label");
  const originalTitle = session.title;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "session-inline-input";
  input.value = originalTitle;
  input.maxLength = 60;

  labelEl.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== originalTitle) {
      vscode.postMessage({
        type: "renomearSessao",
        sessionId: session.id,
        newTitle,
      });
    } else {
      input.replaceWith(labelEl);
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      commit();
    }
    if (e.key === "Escape") {
      input.replaceWith(labelEl);
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (input.isConnected) {input.replaceWith(labelEl);}
    }, 150);
  });
}

function loadChatMessages(session, activeGeneration = null) {
  const chatContainer = getChatContainer();
  if (!chatContainer) {return;}

  chatContainer.innerHTML = "";
  loadingElement = null;
  loadingDefaultMessage = "Pensando";
  mensagemAtualBot = null;
  bufferResposta = "";
  fadeFramePending = false;

  const pendingGeneration =
    activeGeneration && activeGeneration.sessionId === session?.id
      ? activeGeneration
      : null;

  if (
    !pendingGeneration &&
    (!session || !session.messages || session.messages.length === 0)
  ) {
    const div = document.createElement("div");
    div.className = "message bot";
    div.textContent = "Olá! Como posso ajudar com seu código hoje?";
    chatContainer.appendChild(div);
    setGenerationState(false);
    return;
  }

  for (const msg of session?.messages || []) {
    const div = document.createElement("div");
    div.className = `message ${msg.role === "user" ? "user" : "bot"}`;
    if (msg.role !== "user" && typeof marked !== "undefined") {
      div.innerHTML = marked.parse(msg.content);
    } else {
      div.textContent = msg.content;
    }
    appendRagSources(div, msg.metadata?.ragSources);
    appendArchitecturalRefactorAction(div, msg.metadata);
    appendInterruptedStatus(div, msg.metadata?.interrupted === true);
    chatContainer.appendChild(div);
  }

  renderPendingGeneration(pendingGeneration);

  scrollChatToBottom(true);
}

function showSessionSwitchLoading() {
  const chatContainer = getChatContainer();
  if (!chatContainer) {
    return;
  }

  chatContainer.innerHTML = `
    <div
      class="chat-session-loading"
      role="status"
      aria-live="polite"
      aria-label="Carregando conversa"
    >
      <span class="spinner"></span>
    </div>
  `;
  loadingElement = null;
  mensagemAtualBot = null;
  bufferResposta = "";
}

function renderPendingGeneration(activeGeneration) {
  if (!activeGeneration) {
    setGenerationState(shortcutLoadingState.quickAnalysis);
    hydrateChatControlState();
    return;
  }

  activeGenerationId = activeGeneration.generationId || activeGenerationId;
  activeGenerationSessionId =
    activeGeneration.sessionId || activeGenerationSessionId;
  shortcutLoadingState.architectureAnalysis =
    activeGeneration.forcedMode === "architectural-analysis";
  addMessage(activeGeneration.userContent, "user");

  const partialContent = String(activeGeneration.partialContent || "");

  if (!partialContent) {
    showLoading();
    return;
  }

  bufferResposta = partialContent;
  mensagemAtualBot = addMessage("", "bot", false, false);

  if (mensagemAtualBot) {
    mensagemAtualBot.classList.add("streaming-message");
    updateMessagePresentation(mensagemAtualBot, bufferResposta, true);
    renderMarkdownContent(mensagemAtualBot, bufferResposta, true);
  }

  setGenerationState(true);
  hydrateChatControlState();
}

// ── Navbar & routing ──────────────────────────────────────────────────────────
