// Responsabilidade: controla sidebar, lista de sessões, renomeação e troca de conversa.
const sidebar = document.getElementById("chat-sidebar");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const expandSidebarBtn = document.getElementById("expand-sidebar-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const sidebarResizer = document.getElementById("sidebar-resizer");
const appLayout = document.querySelector(".app-layout");
const SIDEBAR_WIDTH_STORAGE_KEY = "atlas.chat.sidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 200;

function getSidebarWidthBounds() {
  const layoutWidth = appLayout?.getBoundingClientRect().width || window.innerWidth;
  const maximum = Math.max(120, Math.min(420, layoutWidth - 180));

  return {
    minimum: Math.min(160, maximum),
    maximum,
  };
}

function setSidebarWidth(width, persist = false) {
  const { minimum, maximum } = getSidebarWidthBounds();
  const normalizedWidth = Math.round(
    Math.min(maximum, Math.max(minimum, Number(width) || DEFAULT_SIDEBAR_WIDTH)),
  );

  document.documentElement.style.setProperty(
    "--sidebar-width",
    `${normalizedWidth}px`,
  );
  sidebarResizer?.setAttribute("aria-valuenow", String(normalizedWidth));
  sidebarResizer?.setAttribute("aria-valuemin", String(minimum));
  sidebarResizer?.setAttribute("aria-valuemax", String(maximum));

  if (persist) {
    try {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(normalizedWidth),
      );
    } catch {
      // Storage can be unavailable in restricted webview contexts.
    }
  }

  return normalizedWidth;
}

function restoreSidebarWidth() {
  let storedWidth = DEFAULT_SIDEBAR_WIDTH;

  try {
    storedWidth = Number(
      window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY),
    );
  } catch {
    // Use the default width when storage is unavailable.
  }

  setSidebarWidth(storedWidth || DEFAULT_SIDEBAR_WIDTH);
}

function setupSidebarResize() {
  if (!sidebar || !sidebarResizer || !appLayout) {
    return;
  }

  let activePointerId = null;

  const finishResize = () => {
    if (activePointerId === null) {
      return;
    }

    activePointerId = null;
    sidebar.classList.remove("resizing");
    document.body.classList.remove("sidebar-resizing");
    const currentWidth = sidebar.getBoundingClientRect().width;
    setSidebarWidth(currentWidth, true);
  };

  sidebarResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || sidebar.classList.contains("collapsed")) {
      return;
    }

    activePointerId = event.pointerId;
    sidebarResizer.setPointerCapture(event.pointerId);
    sidebar.classList.add("resizing");
    document.body.classList.add("sidebar-resizing");
    event.preventDefault();
  });

  sidebarResizer.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) {
      return;
    }

    const layoutLeft = appLayout.getBoundingClientRect().left;
    setSidebarWidth(event.clientX - layoutLeft);
  });

  sidebarResizer.addEventListener("pointerup", finishResize);
  sidebarResizer.addEventListener("pointercancel", finishResize);
  sidebarResizer.addEventListener("dblclick", () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH, true);
  });
  sidebarResizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setSidebarWidth(
      sidebar.getBoundingClientRect().width + direction * 10,
      true,
    );
    event.preventDefault();
  });

  window.addEventListener("resize", () => {
    const configuredWidth = Number.parseFloat(
      document.documentElement.style.getPropertyValue("--sidebar-width"),
    );
    setSidebarWidth(configuredWidth || DEFAULT_SIDEBAR_WIDTH);
  });

  restoreSidebarWidth();
}

setupSidebarResize();

function rememberActiveGeneration(activeGeneration) {
  if (!activeGeneration?.sessionId) {
    return null;
  }

  const incomingGenerationId = activeGeneration.generationId || null;
  const previousGeneration = activeGenerationSnapshots.get(
    activeGeneration.sessionId,
  );
  const isSameGeneration =
    !!previousGeneration &&
    ((incomingGenerationId &&
      previousGeneration.generationId === incomingGenerationId) ||
      (!incomingGenerationId &&
        previousGeneration.sessionId === activeGeneration.sessionId));

  const snapshot = {
    userContent: "",
    partialContent: "",
    isStreaming: false,
    ...(isSameGeneration ? previousGeneration : {}),
    ...activeGeneration,
  };
  activeGenerationSnapshots.set(snapshot.sessionId, snapshot);
  syncActiveGenerationForCurrentSession();

  return snapshot;
}

function rememberActiveGenerations(activeGenerations) {
  const generations = Array.isArray(activeGenerations)
    ? activeGenerations
    : activeGenerations
      ? [activeGenerations]
      : [];

  generations.forEach(rememberActiveGeneration);
  syncActiveGenerationForCurrentSession();

  return activeSessionId
    ? activeGenerationSnapshots.get(activeSessionId) || null
    : null;
}

function syncActiveGenerationForCurrentSession() {
  const activeGeneration = activeSessionId
    ? activeGenerationSnapshots.get(activeSessionId)
    : null;

  activeGenerationSessionId = activeGeneration?.sessionId || null;
  activeGenerationId = activeGeneration?.generationId || null;
}

function clearActiveGenerationSnapshot({ sessionId, generationId } = {}) {
  let targetSessionId = sessionId;

  if (!targetSessionId && generationId) {
    targetSessionId = [...activeGenerationSnapshots.values()].find(
      (generation) => generation.generationId === generationId,
    )?.sessionId;
  }

  if (targetSessionId) {
    const snapshot = activeGenerationSnapshots.get(targetSessionId);
    const shouldClear =
      !!snapshot &&
      (!generationId ||
        !snapshot.generationId ||
        snapshot.generationId === generationId);

    if (shouldClear) {
      activeGenerationSnapshots.delete(targetSessionId);
    }
  }

  syncActiveGenerationForCurrentSession();
}

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
    const isGenerating = activeGenerationSnapshots.has(session.id);
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

function appendChatDateHeader(chatContainer, session) {
  if (!session?.createdAt) {
    return;
  }

  const createdAt = new Date(session.createdAt);

  if (Number.isNaN(createdAt.getTime())) {
    return;
  }

  const header = document.createElement("time");
  header.className = "chat-date-header";
  header.dateTime = createdAt.toISOString();
  header.textContent = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(createdAt);
  chatContainer.appendChild(header);
}

function loadChatMessages(session, activeGenerations = []) {
  const chatContainer = getChatContainer();
  if (!chatContainer) {return;}

  chatContainer.innerHTML = "";
  loadingElement = null;
  loadingDefaultMessage = "Pensando";
  mensagemAtualBot = null;
  pendingCodeEditUserMessage = null;
  bufferResposta = "";
  fadeFramePending = false;

  rememberActiveGenerations(activeGenerations);
  const pendingGeneration = session?.id
    ? activeGenerationSnapshots.get(session.id) || null
    : null;
  shortcutLoadingState.quickAnalysis = false;
  shortcutLoadingState.codeEdit = false;
  shortcutLoadingState.architectureAnalysis = false;
  appendChatDateHeader(chatContainer, session);

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
    shortcutLoadingState.quickAnalysis = false;
    shortcutLoadingState.codeEdit = false;
    shortcutLoadingState.architectureAnalysis = false;
    setGenerationState(false);
    hydrateChatControlState();
    return;
  }

  rememberActiveGeneration(activeGeneration);
  shortcutLoadingState.quickAnalysis =
    activeGeneration.forcedMode === "quick-analysis";
  shortcutLoadingState.codeEdit =
    activeGeneration.forcedMode === "code-edit" ||
    activeGeneration.forcedMode === "architecture-code-edit";
  shortcutLoadingState.architectureAnalysis =
    activeGeneration.forcedMode === "architectural-analysis";

  if (activeGeneration.userContent) {
    const userMessage = addMessage(activeGeneration.userContent, "user");

    if (activeGeneration.forcedMode === "architecture-code-edit") {
      pendingCodeEditUserMessage = userMessage;
    }
  }

  const partialContent = String(activeGeneration.partialContent || "");
  const loadingMessage =
    activeGeneration.forcedMode === "quick-analysis"
      ? "Analisando"
      : shortcutLoadingState.codeEdit
        ? "Refatorando"
        : "Pensando";

  if (!partialContent) {
    showLoading(loadingMessage);
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
