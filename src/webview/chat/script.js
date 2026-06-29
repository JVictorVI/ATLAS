const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────

const contentContainer = document.getElementById("content-container");
const chatgBtn = document.getElementById("chat-btn");
const libraryBtn = document.getElementById("library-btn");
const searchBtn = document.getElementById("search-btn");
const configBtn = document.getElementById("config-panel-btn");

let currentView = "chat";
let loadingElement = null;
let loadingDefaultMessage = "Pensando";
let mensagemAtualBot = null;
let bufferResposta = "";
let isLoadingCloudModels = false;
let cloudModelLoadError = null;
let isGeneratingResponse = false;
let shouldAutoScrollChat = true;

const CHAT_BOTTOM_THRESHOLD_PX = 72;

// --- VARIÁVEIS PARA O EFEITO MÁQUINA DE ESCREVER ---
let fadeFramePending = false;

let shortcutLoadingState = {
  quickAnalysis: false,
  architectureAnalysis: false,
};

if (typeof marked !== "undefined") {
  marked.setOptions({
    gfm: true,
    breaks: true,
  });
}

let isStudyModeEnabled = false;

let modelsData = { local: { name: "Local", type: "local", models: [] } };
let isRefreshingModelCatalog = false;
let selectedMode = "local";
let selectedProvider = null;
let selectedModel = null;
let libraryHealth = null;
let libraryModels = [];
let isLocalEngineActionRunning = false;
let isLocalHealthLoading = false;
let localHealthLoadError = null;
let localHealthLoadingTimeout = undefined;

function notifyCurrentView() {
  vscode.postMessage({ type: "atualizarViewAtual", view: currentView });
}

function requestLatestLlmState() {
  isRefreshingModelCatalog = true;
  vscode.postMessage({ type: "carregarLLMs" });
}

// Session state
let activeSessions = []; // AtlasSessionSummary[]
let activeSessionId = null; // string | null
let editingSessionId = null; // string | null (for inline rename)
let activeGenerationSessionId = null;

// ── Sidebar ───────────────────────────────────────────────────────────────────

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

function promptCreateSession() {
  // Inline creation: append an input item to the session list
  const li = document.createElement("li");
  li.className = "session-item session-new-input";
  li.innerHTML = `
    <i class="codicon codicon-comment-discussion session-icon"></i>
    <input type="text" class="session-inline-input" id="new-session-input"
           placeholder="Nome da sessão..." maxlength="60" />
  `;
  const sessionList = document.getElementById("session-list");
  sessionList.prepend(li);

  const input = document.getElementById("new-session-input");
  input.focus();

  function commit() {
    const title = input.value.trim() || "Nova Sessão";
    li.remove();
    vscode.postMessage({ type: "criarSessao", title });
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") li.remove();
  });

  input.addEventListener("blur", () => {
    // Small delay so click on another item doesn't double-fire
    setTimeout(() => {
      if (document.getElementById("new-session-input")) li.remove();
    }, 150);
  });
}

function renderSessionList() {
  const sessionList = document.getElementById("session-list");
  if (!sessionList) return;

  // Keep any pending new-session input
  const pendingInput = sessionList.querySelector(".session-new-input");

  sessionList.innerHTML = "";
  if (pendingInput) sessionList.appendChild(pendingInput);

  activeSessions.forEach((session) => {
    const isGenerating = session.id === activeGenerationSessionId;
    const li = document.createElement("li");
    li.className = `session-item${session.id === activeSessionId ? " active" : ""}${isGenerating ? " generating" : ""}`;
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

    li.innerHTML = `
      <i class="codicon ${icon} session-icon"></i>
      <span class="session-label" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
      ${generationIndicator}
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
      if (e.target.closest(".session-action-btn")) return;
      if (session.id !== activeSessionId) {
        vscode.postMessage({ type: "trocarSessao", sessionId: session.id });
      }
    });

    li.querySelector(".rename-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      startInlineRename(li, session);
    });

    li.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeSessions.length === 1) {
        // Don't allow deleting the only session — just clear it
        vscode.postMessage({ type: "excluirSessao", sessionId: session.id });
      } else {
        vscode.postMessage({ type: "excluirSessao", sessionId: session.id });
      }
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
      if (input.isConnected) input.replaceWith(labelEl);
    }, 150);
  });
}

function loadChatMessages(session, activeGeneration = null) {
  const chatContainer = getChatContainer();
  if (!chatContainer) return;

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
    chatContainer.appendChild(div);
  }

  renderPendingGeneration(pendingGeneration);

  scrollChatToBottom(true);
}

function renderPendingGeneration(activeGeneration) {
  if (!activeGeneration) {
    setGenerationState(false);
    return;
  }

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
}

// ── Navbar & routing ──────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const popover = document.getElementById("agent-popover");
  const btn = document.getElementById("open-popover");
  document
    .querySelectorAll(".dropdown-list")
    .forEach((list) => list.classList.add("hidden"));
  if (popover && btn && !popover.classList.contains("hidden")) {
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      popover.classList.add("hidden");
    }
  }
});

function updateActiveTab(activeId) {
  document
    .querySelectorAll(".navbar button")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(activeId)?.classList.add("active");
}

function getChatContainer() {
  return document.getElementById("chat-container");
}

function isChatPinnedToBottom(chatContainer) {
  if (!chatContainer) {
    return true;
  }

  const distanceFromBottom =
    chatContainer.scrollHeight -
    chatContainer.scrollTop -
    chatContainer.clientHeight;

  return distanceFromBottom <= CHAT_BOTTOM_THRESHOLD_PX;
}

function scrollChatToBottom(force = false) {
  const chatContainer = getChatContainer();
  if (!chatContainer) {
    return;
  }

  if (force || shouldAutoScrollChat) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    shouldAutoScrollChat = true;
  }
}

function bindChatScrollTracking() {
  const chatContainer = getChatContainer();
  if (!chatContainer) {
    return;
  }

  shouldAutoScrollChat = true;

  chatContainer.addEventListener("scroll", () => {
    shouldAutoScrollChat = isChatPinnedToBottom(chatContainer);
  });
}

function getSingleLineInputHeight(input) {
  const probe = input.cloneNode();

  probe.value = "A";
  probe.rows = 1;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.height = "auto";
  probe.style.width = `${input.clientWidth || input.offsetWidth}px`;
  probe.style.left = "-9999px";
  probe.style.top = "0";

  document.body.appendChild(probe);
  const height = probe.scrollHeight;
  probe.remove();

  return height;
}

function resizeChatInput(input) {
  if (!input) {
    return;
  }

  const singleLineHeight = getSingleLineInputHeight(input);

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 148)}px`;
  input
    .closest(".input-container")
    ?.classList.toggle("expanded", input.scrollHeight > singleLineHeight + 2);
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function renderChatView() {
  currentView = "chat";
  notifyCurrentView();

  contentContainer.innerHTML = `
    <div id="chat-container">
      <div class="message bot">Olá! Como posso ajudar com seu código hoje?</div>
    </div>

    <div class="input-area">
      <div id="agent-popover" class="agent-popover hidden"></div>

            <div class="top-controls">
                <div class="model-selector" id="open-popover" title="Selecionar Modelo">
                    <i class="codicon codicon-chevron-down"></i>
                    <span id="main-btn-text">${selectedModel ? selectedModel.name : "Selecionar modelo"}</span>
                    <i class="codicon codicon-screenfull" style="font-size: 14px; margin-left: 4px;"></i>
                </div>
                
                <div class="action-buttons">
                    <button class="action-btn" id="architeture-analysis-btn">Analisar Arquitetura</button>
                    <button class="action-btn" id="quick-analysis-btn">Análise Rápida</button>
                    <button class="action-btn icon-action-btn hidden" id="clear-quick-analysis-btn" title="Limpar marcações da análise rápida" aria-label="Limpar marcações da análise rápida">
                      <i class="codicon codicon-clear-all"></i>
                    </button>
                </div>
            </div>

            <div class="main-input-container"> 
            
              <div class="input-container">
                  <textarea id="pergunta" rows="1" placeholder="Perguntar ao ATLAS"></textarea>
                  
                  <button id="study-mode-btn" title="Modo Estudante: o ATLAS explica o raciocínio e ajuda você a chegar à solução entendendo cada etapa." aria-pressed="false">
                    <i class="codicon codicon-mortar-board"></i>
                  </button>

                  <button id="send-btn" title="Enviar">
                      <i class="codicon codicon-arrow-up"></i>
                  </button>
              </div>
            </div>
        </div>
    `;

  setupChatEvents();
  requestLatestLlmState();

  // Request sessions from backend on first render
  vscode.postMessage({ type: "listarSessoes" });
  vscode.postMessage({ type: "consultarMarcacoesAnaliseRapida" });
}

// ── Model popover ─────────────────────────────────────────────────────────────

function hydratemodelsDataFromBackend(payload) {
  modelsData = {
    local: { name: "Local", type: "local", models: payload.localModels || [] },
  };

  for (const provider of payload.providers || []) {
    modelsData[provider.id] = {
      name: provider.name,
      type: "cloud",
      models: provider.models || [],
    };
  }

  selectedMode = payload.selectedMode || "local";
  selectedProvider = payload.selectedProviderId || null;

  if (selectedMode === "local") {
    const localModels = modelsData.local?.models || [];
    selectedModel =
      localModels.find((m) => m.id === payload.selectedLocalModelId) ||
      localModels[0] ||
      null;
  } else {
    selectedModel = payload.selectedCloudModelId
      ? { id: payload.selectedCloudModelId, name: payload.selectedCloudModelId }
      : null;
  }

  updateMainButton();

  if (selectedMode === "cloud" && selectedProvider) {
    isLoadingCloudModels = true;
    cloudModelLoadError = null;
    vscode.postMessage({
      type: "selecionarProviderCloud",
      providerId: selectedProvider,
    });
  } else {
    isLoadingCloudModels = false;
    cloudModelLoadError = null;
  }

  const popover = document.getElementById("agent-popover");
  if (popover && !popover.classList.contains("hidden")) renderPopoverContent();

  applyStudyModeState(payload.studyModeEnabled === true);
}

function renderPopoverContent() {
  const popover = document.getElementById("agent-popover");
  if (!popover) return;

  const cloudProviders = Object.entries(modelsData).filter(
    ([, val]) => val.type === "cloud",
  );
  const localModels = modelsData.local?.models || [];
  const cloudModels =
    selectedProvider && modelsData[selectedProvider]
      ? modelsData[selectedProvider].models || []
      : [];
  const providerText =
    selectedProvider && modelsData[selectedProvider]
      ? modelsData[selectedProvider].name
      : "Selecione um provedor";
  const modelText = selectedModel ? selectedModel.name : "Selecione um modelo";

  const localModelListHtml = isRefreshingModelCatalog
    ? `<div class="dropdown-loading"><div class="spinner small"></div><span>Atualizando modelos...</span></div>`
    : localModels.length
      ? localModels
          .map(
            (m) => `
        <div class="dropdown-item model-item ${selectedModel?.id === m.id && selectedMode === "local" ? "selected" : ""}"
          data-mode="local" data-value="${m.id}" data-name="${m.name}" title="${m.name}">
          <span class="dropdown-item-label">${m.name}</span>
        </div>`,
          )
          .join("")
      : `<div class="dropdown-empty">Nenhum modelo local encontrado</div>`;

  const providerListHtml = cloudProviders.length
    ? cloudProviders
        .map(
          ([key, val]) => `
        <div class="dropdown-item provider-item ${selectedProvider === key ? "selected" : ""}"
          data-value="${key}" title="${val.name}">
          <span class="dropdown-item-label">${val.name}</span>
        </div>`,
        )
        .join("")
    : `<div class="dropdown-empty">Nenhum provedor encontrado</div>`;

  const cloudModelListHtml = isLoadingCloudModels
    ? `<div class="dropdown-loading"><div class="spinner small"></div><span>Buscando modelos do provedor...</span></div>`
    : cloudModelLoadError
      ? `<div class="dropdown-empty dropdown-error"><i class="codicon codicon-error"></i><span>${escapeHtml(cloudModelLoadError)}</span></div>`
      : cloudModels.length
        ? cloudModels
            .map(
              (m) => `
          <div class="dropdown-item model-item ${selectedModel?.id === m.id && selectedMode === "cloud" ? "selected" : ""}"
            data-mode="cloud" data-value="${m.id}" data-name="${m.name}" title="${m.name}">
            <span class="dropdown-item-label">${m.name}</span>
          </div>`,
            )
            .join("")
        : `<div class="dropdown-empty"><i class="codicon codicon-info"></i><span>Nenhum modelo encontrado para este provedor.</span></div>`;

  popover.innerHTML = `
    <div class="popover-header">
      <button class="popover-icon-btn ${selectedMode === "local" ? "active" : ""}" id="tab-local" title="Modelos Locais">
        <i class="codicon codicon-device-desktop"></i>
      </button>
      <div class="popover-separator"></div>
      <button class="popover-icon-btn ${selectedMode === "cloud" ? "active" : ""}" id="tab-cloud" title="Nuvem">
        <i class="codicon codicon-cloud"></i>
      </button>
    </div>
    ${
      selectedMode === "local"
        ? `<div class="custom-dropdown">
          <button class="popover-dropdown-btn" id="btn-model">
            <span class="truncate">${modelText}</span>
            <i class="codicon codicon-chevron-down"></i>
          </button>
          <div class="dropdown-list dropdown-scroll hidden" id="list-model">${localModelListHtml}</div>
        </div>`
        : `<div class="custom-dropdown">
          <button class="popover-dropdown-btn" id="btn-provider">
            <span class="truncate">${providerText}</span>
            <i class="codicon codicon-chevron-down"></i>
          </button>
          <div class="dropdown-list dropdown-scroll hidden" id="list-provider">${providerListHtml}</div>
        </div>
        <div class="custom-dropdown">
          <button class="popover-dropdown-btn" id="btn-model">
            <span class="truncate model-loading-label">${
              isLoadingCloudModels
                ? '<span class="spinner small inline-spinner"></span>Carregando modelos...'
                : cloudModelLoadError
                  ? "Erro ao carregar modelos"
                  : modelText
            }</span>
            <i class="codicon codicon-chevron-down"></i>
          </button>
          <div class="dropdown-list dropdown-scroll hidden" id="list-model">${cloudModelListHtml}</div>
        </div>`
    }
  `;

  document.getElementById("tab-local")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedMode !== "local") {
      selectedMode = "local";
      selectedModel = localModels[0] || null;
      isLoadingCloudModels = false;
      cloudModelLoadError = null;
      vscode.postMessage({ type: "selecionarModo", mode: "local" });
      renderPopoverContent();
      updateMainButton();
    }
  });

  document.getElementById("tab-cloud")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedMode !== "cloud") {
      selectedMode = "cloud";
      if (!selectedProvider) selectedProvider = cloudProviders[0]?.[0] || null;
      selectedModel = null;
      cloudModelLoadError = null;
      vscode.postMessage({ type: "selecionarModo", mode: "cloud" });
      renderPopoverContent();
      updateMainButton();
      if (selectedProvider) {
        isLoadingCloudModels = true;
        cloudModelLoadError = null;
        renderPopoverContent();
        vscode.postMessage({
          type: "selecionarProviderCloud",
          providerId: selectedProvider,
        });
      }
    }
  });

  const btnProvider = document.getElementById("btn-provider");
  btnProvider?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("list-provider")?.classList.toggle("hidden");
    document.getElementById("list-model")?.classList.add("hidden");
  });

  document.querySelectorAll(".provider-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedProvider = item.getAttribute("data-value");
      selectedModel = null;
      isLoadingCloudModels = true;
      cloudModelLoadError = null;
      renderPopoverContent();
      updateMainButton();
      vscode.postMessage({
        type: "selecionarProviderCloud",
        providerId: selectedProvider,
      });
    });
  });

  const btnModel = document.getElementById("btn-model");
  btnModel?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("list-model")?.classList.toggle("hidden");
    document.getElementById("list-provider")?.classList.add("hidden");
  });

  document.querySelectorAll(".model-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedModel = {
        id: item.getAttribute("data-value"),
        name: item.getAttribute("data-name"),
      };
      document.getElementById("list-model")?.classList.add("hidden");
      renderPopoverContent();
      updateMainButton();
      vscode.postMessage({
        type: "selecionarModelo",
        mode: item.getAttribute("data-mode"),
        modelId: selectedModel.id,
      });
    });
  });
}

function updateMainButton() {
  const mainBtnText = document.getElementById("main-btn-text");
  if (!mainBtnText) return;
  if (selectedMode === "local") {
    mainBtnText.textContent = selectedModel
      ? selectedModel.name
      : "Selecionar modelo local";
    return;
  }
  const providerName =
    selectedProvider && modelsData[selectedProvider]
      ? modelsData[selectedProvider].name
      : "Nuvem";
  mainBtnText.textContent = `${providerName} · ${selectedModel ? selectedModel.name : "Selecionar modelo"}`;
}

// ── Chat events ───────────────────────────────────────────────────────────────

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
  const studyModeBtn = document.getElementById("study-mode-btn");

  bindChatScrollTracking();

  if (!input || !btn) return;

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
    if (shortcutLoadingState.quickAnalysis) return;
    shortcutLoadingState.quickAnalysis = true;
    setShortcutLoading("quick-analysis", true);
    vscode.postMessage({ type: "executarAnaliseRapida" });
  });

  clearQuickAnalysisBtn?.addEventListener("click", () => {
    vscode.postMessage({ type: "limparMarcacoesAnaliseRapida" });
  });

  if (architetureAnalysisBtn) {
    architetureAnalysisBtn.addEventListener("click", () => {
      if (shortcutLoadingState.architectureAnalysis || isGeneratingResponse) {
        return;
      }

      shortcutLoadingState.architectureAnalysis = true;
      setShortcutLoading("architecture-analysis", true);
      showLoading();

      vscode.postMessage({
        type: "enviarPergunta",
        forcedMode: "architectural-analysis",
        value: "Realize uma análise arquitetural deste código.",
        selectedView: currentView,
        agentId: selectedModel ? selectedModel.id : null,
      });
    });
  }

  if (studyModeBtn) {
    studyModeBtn.addEventListener("click", () => {
      const nextValue = !isStudyModeEnabled;

      applyStudyModeState(nextValue);

      vscode.postMessage({
        type: "alterarModoEstudo",
        enabled: nextValue,
      });
    });
  }

  function enviarPergunta() {
    if (isGeneratingResponse) {
      cancelarGeracao();
      return;
    }

    const texto = input.value.trim();
    if (!texto) return;
    addMessage(texto, "user");
    showLoading();
    activeGenerationSessionId = activeSessionId;
    renderSessionList();

    vscode.postMessage({
      type: "enviarPergunta",
      value: texto,
      selectedView: currentView,
      agentId: selectedModel ? selectedModel.id : null,
      forcedMode: isStudyModeEnabled ? "study-mode" : undefined,
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
}

function cancelarGeracao() {
  if (!isGeneratingResponse) return;

  vscode.postMessage({
    type: "cancelarGeracao",
  });
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
  if (!chatContainer) return null;
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

function showLoading(message = "Pensando") {
  const chatContainer = getChatContainer();
  if (!chatContainer) return;
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

function renderConfigView() {
  currentView = "config";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <div id="settings-view">
      <button id="atlas-btn" class="settings-option">Configurações Gerais</button>
      <button id="keys-btn" class="settings-option">Provedores em Nuvem</button>
      <button id="rag-btn" class="settings-option">RAG</button>
    </div>
  `;
  document.getElementById("keys-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "config" });
  });
  document.getElementById("atlas-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "atlas" });
  });
  document.getElementById("rag-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "rag" });
  });
}

function renderLibraryView() {
  currentView = "library";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <section class="local-health-view local-health-loading-active" aria-busy="true">
      <div class="local-health-header">
        <div class="local-health-icon" aria-hidden="true">
          <i class="codicon codicon-pulse"></i>
        </div>
        <div>
          <h2>Ambiente Local</h2>
          <p>Saude da execução dos modelos locais</p>
        </div>
      </div>

      <div
        id="local-health-loading"
        class="local-health-loading"
        role="status"
        aria-live="polite"
        aria-label="Carregando ambiente local"
      >
        <span class="spinner" aria-hidden="true"></span>
      </div>

      <div id="local-health-content" class="local-health-content" aria-hidden="true">
        <div class="local-health-status">
        <span class="local-health-dot"></span>
        <span id="local-health-engine">Engine: -</span>
      </div>

      <button class="local-engine-toggle-button" id="local-engine-toggle">
        <i class="codicon codicon-debug-start"></i>
        <span>Iniciar engine</span>
      </button>

      <div class="local-health-meter">
        <div class="local-health-meter-top">
          <span>VRAM</span>
          <strong id="local-health-vram-summary">-</strong>
        </div>
        <div class="local-health-bar" aria-hidden="true">
          <span id="local-health-vram-bar"></span>
        </div>
        <div class="local-health-meter-meta">
          <span id="local-health-vram-used">Usada: -</span>
          <span id="local-health-vram-free">Livre: -</span>
        </div>
      </div>

      <div class="local-health-list">
        <div class="local-health-item">
          <span>Modelos instalados</span>
          <strong id="local-health-model-count">0</strong>
        </div>
        <div class="local-health-item">
          <span>Espaço ocupado</span>
          <strong id="local-health-model-size">-</strong>
        </div>
        <div class="local-health-item local-health-folder">
          <span>Pasta dos modelos</span>
          <strong id="local-health-model-folder">-</strong>
        </div>
      </div>

      <button class="local-health-folder-button" id="local-health-open-folder">
        <i class="codicon codicon-folder-opened"></i>
        <span>Abrir pasta</span>
      </button>
      </div>
    </section>
  `;
  bindLocalHealthEvents();
  vscode.postMessage({ type: "abrirPainelConfig", selectedView: "library" });
  requestLocalHealthModels();
}

function requestLocalHealthModels() {
  localHealthLoadError = null;
  setLocalHealthLoading(true);
  window.clearTimeout(localHealthLoadingTimeout);
  localHealthLoadingTimeout = window.setTimeout(() => {
    if (!isLocalHealthLoading) {
      return;
    }

    localHealthLoadError =
      "O ambiente local demorou mais que o esperado para responder.";
    setLocalHealthLoading(false);
    renderLocalHealthPanel();
  }, 10000);

  vscode.postMessage({ type: "requestModels" });
}

function setLocalHealthLoading(loading) {
  isLocalHealthLoading = loading;

  const view = document.querySelector(".local-health-view");
  const loadingElement = document.getElementById("local-health-loading");
  const content = document.getElementById("local-health-content");

  view?.classList.toggle("local-health-loading-active", loading);
  view?.setAttribute("aria-busy", loading ? "true" : "false");

  if (loadingElement) {
    loadingElement.hidden = !loading;
  }

  if (content) {
    content.setAttribute("aria-hidden", loading ? "true" : "false");
  }
}

function releaseLocalHealthLoading() {
  window.clearTimeout(localHealthLoadingTimeout);
  setLocalHealthLoading(false);
}

function bindLocalHealthEvents() {
  document
    .getElementById("local-health-open-folder")
    ?.addEventListener("click", () => {
      vscode.postMessage({ type: "openLocalModelsFolder" });
    });

  document
    .getElementById("local-engine-toggle")
    ?.addEventListener("click", () => {
      if (isLocalEngineActionRunning) {
        return;
      }

      const isRunning = libraryHealth?.engineRunning === true;
      isLocalEngineActionRunning = true;
      renderLocalEngineToggle();
      vscode.postMessage({
        type: isRunning ? "stopLocalEngineRequest" : "startLocalEngineRequest",
      });
    });
}

function renderLocalHealthPanel() {
  const health = libraryHealth || {};
  const gpuMemory = health.gpuMemory || null;
  const usedBytes = Number(gpuMemory?.usedBytes) || 0;
  const totalBytes = Number(gpuMemory?.totalBytes) || 0;
  const freeBytes =
    Number(gpuMemory?.freeBytes) || Math.max(0, totalBytes - usedBytes);
  const usedPercent =
    totalBytes > 0
      ? Math.max(0, Math.min(100, (usedBytes / totalBytes) * 100))
      : 0;

  if (localHealthLoadError) {
    setLocalHealthText("local-health-engine", localHealthLoadError);
    setLocalHealthText("local-health-vram-summary", "-");
    setLocalHealthText("local-health-vram-used", "Usada: -");
    setLocalHealthText("local-health-vram-free", "Livre: -");
    setLocalHealthText("local-health-model-count", "-");
    setLocalHealthText("local-health-model-size", "-");
    setLocalHealthText("local-health-model-folder", "-");

    const bar = document.getElementById("local-health-vram-bar");
    if (bar) {
      bar.style.width = "0%";
    }

    renderLocalEngineToggle();
    return;
  }

  setLocalHealthText(
    "local-health-engine",
    `Engine: ${String(health.engineType || "cpu").toUpperCase()} · ${
      health.engineRunning ? "ativa" : "parada"
    }`,
  );
  setLocalHealthText(
    "local-health-vram-summary",
    gpuMemory?.totalLabel || gpuMemory?.label || "Não detectada",
  );
  setLocalHealthText(
    "local-health-vram-used",
    totalBytes > 0
      ? `Usada: ${gpuMemory.usedLabel || formatLocalHealthBytes(usedBytes)}`
      : "Usada: -",
  );
  setLocalHealthText(
    "local-health-vram-free",
    totalBytes > 0
      ? `Livre: ${gpuMemory.freeLabel || formatLocalHealthBytes(freeBytes)}`
      : "Livre: -",
  );
  setLocalHealthText(
    "local-health-model-count",
    String(health.modelsCount ?? libraryModels.length),
  );
  setLocalHealthText(
    "local-health-model-size",
    health.totalSizeLabel || formatLocalHealthBytes(sumLocalModelBytes()),
  );
  setLocalHealthText("local-health-model-folder", health.modelsDir || "-");

  const bar = document.getElementById("local-health-vram-bar");
  if (bar) {
    bar.style.width = `${usedPercent}%`;
  }

  renderLocalEngineToggle();
}

function renderLocalEngineToggle() {
  const button = document.getElementById("local-engine-toggle");
  if (!button) {
    return;
  }

  const isRunning = libraryHealth?.engineRunning === true;
  const icon = isLocalEngineActionRunning
    ? "loading"
    : isRunning
      ? "debug-stop"
      : "debug-start";
  const label = isLocalEngineActionRunning
    ? isRunning
      ? "Parando..."
      : "Iniciando..."
    : isRunning
      ? "Parar engine"
      : "Iniciar engine";

  button.disabled = isLocalEngineActionRunning;
  button.classList.toggle("running", isRunning);
  button.innerHTML = `
    <i class="codicon codicon-${icon}"></i>
    <span>${label}</span>
  `;
}

function setLocalHealthText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? "";
  }
}

function sumLocalModelBytes() {
  return libraryModels.reduce(
    (sum, model) => sum + (Number(model.sizeBytes) || 0),
    0,
  );
}

function formatLocalHealthBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// ── Navbar wiring ─────────────────────────────────────────────────────────────

configBtn?.addEventListener("click", () => {
  renderConfigView();
  hideSessionsButton();
  closeSessionsSidebar();
  updateActiveTab("config-panel-btn");
});
chatgBtn?.addEventListener("click", () => {
  renderChatView();
  showSessionsButton();
  closeSessionsSidebar();
  updateActiveTab("chat-btn");
});
libraryBtn?.addEventListener("click", () => {
  renderLibraryView();
  hideSessionsButton();
  closeSessionsSidebar();
  updateActiveTab("library-btn");
});
searchBtn?.addEventListener("click", () => {
  renderSearchView();
  hideSessionsButton();
  closeSessionsSidebar();
  updateActiveTab("search-btn");
});

function processQueue() {
  if (isTyping) return;

  if (renderQueue.length === 0) {
    if (finishPending) {
      if (mensagemAtualBot) {
        updateMessagePresentation(mensagemAtualBot, bufferResposta, true);
        renderMarkdownContent(mensagemAtualBot, bufferResposta);
      }
      mensagemAtualBot = null;
      bufferResposta = "";
      finishPending = false;
      setGenerationState(false);
    }
    return;
  }

  isTyping = true;

  let charsToType = 1;
  if (renderQueue.length > 20) charsToType = 2;
  if (renderQueue.length > 50) charsToType = 4;
  if (renderQueue.length > 100) charsToType = 8;

  const chunk = renderQueue.slice(0, charsToType);
  renderQueue = renderQueue.slice(charsToType);

  bufferResposta += chunk;

  if (mensagemAtualBot) {
    try {
      if (typeof marked !== "undefined") {
        updateMessagePresentation(mensagemAtualBot, bufferResposta, true);
        renderMarkdownContent(mensagemAtualBot, bufferResposta, true);
      } else {
        mensagemAtualBot.innerText = bufferResposta + " █";
      }
    } catch (e) {
      mensagemAtualBot.innerText = bufferResposta + " █";
    }
  }

  scrollChatToBottom();

  setTimeout(() => {
    isTyping = false;
    processQueue();
  }, 15);
}

const searchableModelCatalog = [
  ["qwen3-coder-30b", "30B", "Qwen", "23/01/2025", "23.245"],
  ["phi-4-gguf", "15B", "Microsoft", "18/06/2024", "710.171"],
  ["gemma-3-27b-it", "27B", "Google", "28/11/2024", "140.294"],
  ["gpt-oss-20b", "20B", "OpenAI", "28/11/2025", "1.147.142"],
  ["ministral-3-14b-reasoning", "14B", "Mistral", "31/05/2025", "694.240"],
  ["deepseek-r1-0528-qwen3-8b", "8B", "DeepSeek", "19/10/2023", "5.583.787"],
  ["gemma-3-4b-it", "4B", "Google", "25/12/2024", "4.390.982"],
  ["granite-4-h-tiny", "7B", "IBM", "05/07/2025", "15.662"],
].map(([id, badge, author, updatedAt, downloads]) => ({
  id,
  name: id,
  badge,
  author,
  updatedAt,
  downloads,
}));

function bindSearchModelEvents() {
  renderModelCards(searchableModelCatalog);

  const modelSearch = document.getElementById("model-search");
  modelSearch?.addEventListener("input", () => {
    const query = modelSearch.value.trim().toLowerCase();
    const filteredModels = searchableModelCatalog.filter((model) =>
      `${model.name} ${model.author} ${model.badge}`
        .toLowerCase()
        .includes(query),
    );
    const activeModelId =
      document.querySelector(".model-card.active")?.getAttribute("data-id") ||
      "qwen3-coder-30b";
    const countLabel = document.getElementById("search-results-count");

    if (countLabel) {
      countLabel.textContent = query
        ? `${filteredModels.length} RESULTADOS ENCONTRADOS`
        : "628 RESULTADOS ENCONTRADOS";
    }

    renderModelCards(filteredModels, activeModelId);
  });
}

function bindModelCardEvents() {
  document.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".model-card")
        .forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      vscode.postMessage({
        type: "abrirDetalhesModelo",
        modelId: card.getAttribute("data-id"),
      });
    });
  });
}

function renderModelCards(models, activeModelId = "qwen3-coder-30b") {
  const modelList = document.getElementById("model-list");
  if (!modelList) return;

  modelList.innerHTML =
    models
      .map(
        (model) => `
          <div class="model-card ${model.id === activeModelId ? "active" : ""}" data-id="${model.id}">
            <div class="model-badge">${model.badge}</div>
            <div class="model-card-info">
              <span class="model-card-name" title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</span>
              <span class="model-card-author"><i class="codicon codicon-code"></i> ${escapeHtml(model.author)}</span>
              <div class="model-card-footer">
                <span>Atualizado em ${model.updatedAt}</span>
                <span><i class="codicon codicon-cloud-download"></i> ${model.downloads}</span>
              </div>
            </div>
          </div>
        `,
      )
      .join("") ||
    `<div class="model-list-empty">Nenhum modelo encontrado</div>`;

  bindModelCardEvents();
}

function renderSearchView() {
  currentView = "search";
  notifyCurrentView();
  contentContainer.innerHTML = `
    <div class="search-layout">
      <!-- PARTE DA ESQUERDA: Lista de Agentes -->
      <div class="search-sidebar">
        <div class="search-input-wrapper">
          <input type="text" id="model-search" placeholder="Pesquisar modelos..." />
          <i class="codicon codicon-search search-icon"></i>
        </div>
        <div class="search-results-info">
          <i class="codicon codicon-chevron-right"></i>
          <span id="search-results-count">628 RESULTADOS ENCONTRADOS</span>
        </div>
        
        <div class="model-list" id="model-list">
          <!-- Card 1 (Ativo por padrão) -->
          <div class="model-card active" data-id="qwen3-coder-30b">
            <div class="model-badge">30B</div>
            <div class="model-card-info">
              <span class="model-card-name">qwen3-coder-30b</span>
              <span class="model-card-author"><i class="codicon codicon-code"></i> Qwen</span>
              <div class="model-card-footer">
                <span>Atualizado em 23/01/2025</span>
                <span><i class="codicon codicon-cloud-download"></i> 23.245</span>
              </div>
            </div>
          </div>
          
          <!-- Card 2 -->
          <div class="model-card" data-id="phi-4-gguf">
            <div class="model-badge">15B</div>
            <div class="model-card-info">
              <span class="model-card-name">phi-4-gguf</span>
              <span class="model-card-author"><i class="codicon codicon-code"></i> Microsoft</span>
              <div class="model-card-footer">
                <span>Atualizado em 18/06/2024</span>
                <span><i class="codicon codicon-cloud-download"></i> 710.171</span>
              </div>
            </div>
          </div>
          
          <!-- Card 3 -->
          <div class="model-card" data-id="gemma-3-27b-it">
            <div class="model-badge">27B</div>
            <div class="model-card-info">
              <span class="model-card-name">gemma-3-27b-it</span>
              <span class="model-card-author"><i class="codicon codicon-code"></i> Google</span>
              <div class="model-card-footer">
                <span>Atualizado em 28/11/2024</span>
                <span><i class="codicon codicon-cloud-download"></i> 140.294</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSearchModelEvents();

  document.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".model-card")
        .forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      vscode.postMessage({
        type: "abrirDetalhesModelo",
        modelId: card.getAttribute("data-id"),
      });
    });
  });

  vscode.postMessage({ type: "abrirPainelConfig", selectedView: "search" });
}

// ── Message bus ───────────────────────────────────────────────────────────────

// --- ÚNICO OUVINTE DE MENSAGENS DO VS CODE ---
function isMessageForActiveSession(message) {
  const sessionId = message.sessionId || message.metadata?.sessionId;

  return !sessionId || !activeSessionId || sessionId === activeSessionId;
}

function clearGenerationForMessage(message) {
  const sessionId = message.sessionId || message.metadata?.sessionId;

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

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      setGenerationState(false);
      shortcutLoadingState.architectureAnalysis = false;
      setShortcutLoading("architecture-analysis", false);
      const responseElement = addMessage(message.value, "bot", true, false);
      appendRagSources(responseElement, message.metadata?.ragSources);
      break;
    }

    case "respostaParcial": {
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
        renderLocalHealthPanel();
      }
      break;
    }

    case "fimResposta": {
      clearGenerationForMessage(message);

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

      shortcutLoadingState.architectureAnalysis = false;
      setShortcutLoading("architecture-analysis", false);

      break;
    }

    case "geracaoCancelada": {
      clearGenerationForMessage(message);

      if (!isMessageForActiveSession(message)) {
        break;
      }

      removeLoading();
      finishCurrentBotMessage(true);

      shortcutLoadingState.architectureAnalysis = false;
      setShortcutLoading("architecture-analysis", false);
      break;
    }

    case "erro": {
      clearGenerationForMessage(message);

      if (currentView === "library" && isLocalHealthLoading) {
        localHealthLoadError =
          message.value || "Não foi possível carregar o ambiente local.";
        releaseLocalHealthLoading();
        renderLocalHealthPanel();
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
      shortcutLoadingState.quickAnalysis = false;
      shortcutLoadingState.architectureAnalysis = false;
      setShortcutLoading("quick-analysis", false);
      setShortcutLoading("architecture-analysis", false);
      //addMessage(message.value || "Ocorreu um erro.", "bot");
      break;
    }
    case "analiseRapidaStatus": {
      const isLoading = !!message.value?.loading;
      const isQuickAnalysisFromChat = message.value?.source === "chat";
      shortcutLoadingState.quickAnalysis = isLoading;
      setShortcutLoading("quick-analysis", isLoading);

      if (isQuickAnalysisFromChat && isLoading) {
        setLoadingDefaultMessage("Analisando e marcando no editor");
      }

      const quickAnalysisBtn = document.getElementById("quick-analysis-btn");
      if (quickAnalysisBtn) {
        quickAnalysisBtn.disabled = isLoading;
        quickAnalysisBtn.classList.toggle("loading", isLoading);
      }
      break;
    }
    case "analiseRapidaConcluida": {
      const isQuickAnalysisFromChat = message.value?.source === "chat";

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

      shortcutLoadingState.quickAnalysis = false;
      setShortcutLoading("quick-analysis", false);
      break;
    }
    case "disponibilidadeMarcacoesAnaliseRapida": {
      const clearQuickAnalysisBtn = document.getElementById(
        "clear-quick-analysis-btn",
      );

      clearQuickAnalysisBtn?.classList.toggle(
        "hidden",
        message.value?.available !== true,
      );
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
      if (modelsData[providerId]) modelsData[providerId].models = models;
      isLoadingCloudModels = false;
      cloudModelLoadError = null;
      if (selectedMode === "cloud" && selectedProvider === providerId) {
        const prevId = selectedModel?.id;
        selectedModel =
          models.find((m) => m.id === prevId) || models[0] || null;
        updateMainButton();
        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden"))
          renderPopoverContent();
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
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      activeGenerationSessionId =
        message.value.activeGeneration?.sessionId || null;
      renderSessionList();
      loadChatMessages(message.value.session, message.value.activeGeneration);
      break;
    }

    case "sessaoTrocada": {
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      activeGenerationSessionId =
        message.value.activeGeneration?.sessionId || null;
      renderSessionList();
      loadChatMessages(message.value.session, message.value.activeGeneration);
      break;
    }

    case "sessaoExcluida": {
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

function getShortcutButton(action) {
  if (action === "quick-analysis")
    return document.getElementById("quick-analysis-btn");
  if (action === "architecture-analysis")
    return document.getElementById("architeture-analysis-btn");
  return null;
}

function setShortcutLoading(action, isLoading) {
  const button = getShortcutButton(action);
  if (!button) return;
  const originalLabel =
    button.dataset.originalLabel?.trim() || button.textContent.trim();
  if (!button.dataset.originalLabel)
    button.dataset.originalLabel = originalLabel;
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
  if (isLoading) {
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${originalLabel}</span>`;
  } else {
    button.textContent = button.dataset.originalLabel;
  }
}

function applyStudyModeState(enabled) {
  isStudyModeEnabled = enabled === true;

  const studyModeBtn = document.getElementById("study-mode-btn");
  const input = document.getElementById("pergunta");

  if (studyModeBtn) {
    studyModeBtn.classList.toggle("active", isStudyModeEnabled);
    studyModeBtn.title = isStudyModeEnabled
      ? "Modo Estudante ativo: o ATLAS explica o raciocínio e ajuda você a chegar à solução entendendo cada etapa."
      : "Modo Estudante: o ATLAS explica o raciocínio e ajuda você a chegar à solução entendendo cada etapa.";
    studyModeBtn.setAttribute("aria-pressed", String(isStudyModeEnabled));
  }

  if (input) {
    input.placeholder = isStudyModeEnabled
      ? "Perguntar ao ATLAS em modo estudante"
      : "Perguntar ao ATLAS";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderChatView();
showSessionsButton();
closeSessionsSidebar();
updateActiveTab("chat-btn");
updateMainButton();
vscode.postMessage({ type: "carregarLLMs" });

function showSessionsButton() {
  expandSidebarBtn?.classList.remove("hidden");
}

function hideSessionsButton() {
  expandSidebarBtn?.classList.add("hidden");
}

function closeSessionsSidebar() {
  sidebar?.classList.add("collapsed");
}
