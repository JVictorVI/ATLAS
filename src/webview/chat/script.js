const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────

const contentContainer = document.getElementById("content-container");
const chatgBtn = document.getElementById("chat-btn");
const libraryBtn = document.getElementById("library-btn");
const searchBtn = document.getElementById("search-btn");
const configBtn = document.getElementById("config-panel-btn");

let currentView = "chat";
let loadingElement = null;
let mensagemAtualBot = null;
let bufferResposta = "";
let isLoadingCloudModels = false;

let shortcutLoadingState = {
  quickAnalysis: false,
  architectureAnalysis: false,
};

let modelsData = { local: { name: "Local", type: "local", models: [] } };
let selectedMode = "local";
let selectedProvider = null;
let selectedModel = null;

// Session state
let activeSessions = [];       // AtlasSessionSummary[]
let activeSessionId = null;    // string | null
let editingSessionId = null;   // string | null (for inline rename)

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
  promptCreateSession();
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
    const li = document.createElement("li");
    li.className = `session-item${session.id === activeSessionId ? " active" : ""}`;
    li.dataset.id = session.id;

    const icon = session.hasArchitecturalSummary ? "codicon-history" : "codicon-comment-discussion";
    const msgCount = session.messageCount > 0 ? `<span class="session-count">${session.messageCount}</span>` : "";

    li.innerHTML = `
      <i class="codicon ${icon} session-icon"></i>
      <span class="session-label" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</span>
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
      vscode.postMessage({ type: "renomearSessao", sessionId: session.id, newTitle });
    } else {
      input.replaceWith(labelEl);
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { commit(); }
    if (e.key === "Escape") { input.replaceWith(labelEl); }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (input.isConnected) input.replaceWith(labelEl);
    }, 150);
  });
}

function loadChatMessages(session) {
  const chatContainer = getChatContainer();
  if (!chatContainer) return;

  chatContainer.innerHTML = "";

  if (!session || !session.messages || session.messages.length === 0) {
    const div = document.createElement("div");
    div.className = "message bot";
    div.textContent = "Olá! Como posso ajudar com seu código hoje?";
    chatContainer.appendChild(div);
    return;
  }

  for (const msg of session.messages) {
    const div = document.createElement("div");
    div.className = `message ${msg.role === "user" ? "user" : "bot"}`;
    if (msg.role !== "user" && typeof marked !== "undefined") {
      div.innerHTML = marked.parse(msg.content);
    } else {
      div.textContent = msg.content;
    }
    chatContainer.appendChild(div);
  }

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ── Navbar & routing ──────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const popover = document.getElementById("agent-popover");
  const btn = document.getElementById("open-popover");
  document.querySelectorAll(".dropdown-list").forEach((list) => list.classList.add("hidden"));
  if (popover && btn && !popover.classList.contains("hidden")) {
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      popover.classList.add("hidden");
    }
  }
});

function updateActiveTab(activeId) {
  document.querySelectorAll(".navbar button").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(activeId)?.classList.add("active");
}

function getChatContainer() {
  return document.getElementById("chat-container");
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function renderChatView() {
  currentView = "chat";

  contentContainer.innerHTML = `
    <div id="chat-container">
      <div class="message bot">Olá! Como posso ajudar com seu código hoje?</div>
    </div>

    <div class="input-area">
      <div id="agent-popover" class="agent-popover hidden"></div>

      <div class="top-controls">
        <div class="model-selector" id="open-popover" title="Selecionar Agente">
          <i class="codicon codicon-chevron-down"></i>
          <span id="main-btn-text">${selectedModel ? selectedModel.name : "Selecionar modelo"}</span>
          <i class="codicon codicon-screenfull" style="font-size: 14px; margin-left: 4px;"></i>
        </div>
        <div class="action-buttons">
          <button class="action-btn" id="architeture-analysis-btn">Analisar Arquitetura</button>
          <button class="action-btn" id="quick-analysis-btn">Análise Rápida</button>
        </div>
      </div>

      <div class="input-container">
        <input type="text" id="pergunta" placeholder="Perguntar ao ATLAS" />
        <button id="send-btn" title="Enviar">
          <i class="codicon codicon-arrow-up"></i>
        </button>
      </div>
    </div>
  `;

  setupChatEvents();

  // Request sessions from backend on first render
  vscode.postMessage({ type: "listarSessoes" });
}

// ── Model popover ─────────────────────────────────────────────────────────────

function hydratemodelsDataFromBackend(payload) {
  modelsData = { local: { name: "Local", type: "local", models: payload.localModels || [] } };

  for (const provider of payload.providers || []) {
    modelsData[provider.id] = { name: provider.name, type: "cloud", models: provider.models || [] };
  }

  selectedMode = payload.selectedMode || "local";
  selectedProvider = payload.selectedProviderId || null;

  if (selectedMode === "local") {
    const localModels = modelsData.local?.models || [];
    selectedModel = localModels.find((m) => m.id === payload.selectedLocalModelId) || localModels[0] || null;
  } else {
    selectedModel = payload.selectedCloudModelId
      ? { id: payload.selectedCloudModelId, name: payload.selectedCloudModelId }
      : null;
  }

  updateMainButton();

  const popover = document.getElementById("agent-popover");
  if (popover && !popover.classList.contains("hidden")) renderPopoverContent();

  if (selectedMode === "cloud" && selectedProvider) {
    isLoadingCloudModels = true;
    vscode.postMessage({ type: "selecionarProviderCloud", providerId: selectedProvider });
  }
}

function renderPopoverContent() {
  const popover = document.getElementById("agent-popover");
  if (!popover) return;

  const cloudProviders = Object.entries(modelsData).filter(([, val]) => val.type === "cloud");
  const localModels = modelsData.local?.models || [];
  const cloudModels = selectedProvider && modelsData[selectedProvider] ? modelsData[selectedProvider].models || [] : [];
  const providerText = selectedProvider && modelsData[selectedProvider] ? modelsData[selectedProvider].name : "Selecione um provedor";
  const modelText = selectedModel ? selectedModel.name : "Selecione um modelo";

  const localModelListHtml = localModels.length
    ? localModels.map((m) => `
        <div class="dropdown-item model-item ${selectedModel?.id === m.id && selectedMode === "local" ? "selected" : ""}"
          data-mode="local" data-value="${m.id}" data-name="${m.name}" title="${m.name}">
          <span class="dropdown-item-label">${m.name}</span>
        </div>`).join("")
    : `<div class="dropdown-empty">Nenhum modelo local encontrado</div>`;

  const providerListHtml = cloudProviders.length
    ? cloudProviders.map(([key, val]) => `
        <div class="dropdown-item provider-item ${selectedProvider === key ? "selected" : ""}"
          data-value="${key}" title="${val.name}">
          <span class="dropdown-item-label">${val.name}</span>
        </div>`).join("")
    : `<div class="dropdown-empty">Nenhum provedor encontrado</div>`;

  const cloudModelListHtml = isLoadingCloudModels
    ? `<div class="dropdown-loading"><div class="spinner small"></div><span>Buscando modelos...</span></div>`
    : cloudModels.length
      ? cloudModels.map((m) => `
          <div class="dropdown-item model-item ${selectedModel?.id === m.id && selectedMode === "cloud" ? "selected" : ""}"
            data-mode="cloud" data-value="${m.id}" data-name="${m.name}" title="${m.name}">
            <span class="dropdown-item-label">${m.name}</span>
          </div>`).join("")
      : `<div class="dropdown-empty">Nenhum modelo carregado</div>`;

  popover.innerHTML = `
    <div class="popover-header">
      <button class="popover-icon-btn ${selectedMode === "local" ? "active" : ""}" id="tab-local" title="Agente Local">
        <i class="codicon codicon-device-desktop"></i>
      </button>
      <div class="popover-separator"></div>
      <button class="popover-icon-btn ${selectedMode === "cloud" ? "active" : ""}" id="tab-cloud" title="Nuvem">
        <i class="codicon codicon-cloud"></i>
      </button>
    </div>
    ${selectedMode === "local"
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
          <button class="popover-dropdown-btn" id="btn-model" ${isLoadingCloudModels ? "disabled" : ""}>
            <span class="truncate">${isLoadingCloudModels ? "Carregando modelos..." : modelText}</span>
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
      vscode.postMessage({ type: "selecionarModo", mode: "cloud" });
      renderPopoverContent();
      updateMainButton();
      if (selectedProvider) {
        isLoadingCloudModels = true;
        renderPopoverContent();
        vscode.postMessage({ type: "selecionarProviderCloud", providerId: selectedProvider });
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
      renderPopoverContent();
      updateMainButton();
      vscode.postMessage({ type: "selecionarProviderCloud", providerId: selectedProvider });
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
      selectedModel = { id: item.getAttribute("data-value"), name: item.getAttribute("data-name") };
      document.getElementById("list-model")?.classList.add("hidden");
      renderPopoverContent();
      updateMainButton();
      vscode.postMessage({ type: "selecionarModelo", mode: item.getAttribute("data-mode"), modelId: selectedModel.id });
    });
  });
}

function updateMainButton() {
  const mainBtnText = document.getElementById("main-btn-text");
  if (!mainBtnText) return;
  if (selectedMode === "local") {
    mainBtnText.textContent = selectedModel ? selectedModel.name : "Selecionar modelo local";
    return;
  }
  const providerName = selectedProvider && modelsData[selectedProvider] ? modelsData[selectedProvider].name : "Nuvem";
  mainBtnText.textContent = `${providerName} · ${selectedModel ? selectedModel.name : "Selecionar modelo"}`;
}

// ── Chat events ───────────────────────────────────────────────────────────────

function setupChatEvents() {
  const input = document.getElementById("pergunta");
  const btn = document.getElementById("send-btn");
  const popoverBtn = document.getElementById("open-popover");
  const agentPopover = document.getElementById("agent-popover");
  const quickAnalysisBtn = document.getElementById("quick-analysis-btn");
  const architetureAnalysisBtn = document.getElementById("architeture-analysis-btn");

  if (!input || !btn) return;

  popoverBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (agentPopover.classList.contains("hidden")) {
      agentPopover.classList.remove("hidden");
      renderPopoverContent();
    } else {
      agentPopover.classList.add("hidden");
    }
  });

  quickAnalysisBtn?.addEventListener("click", () => {
    if (shortcutLoadingState.quickAnalysis) return;
    shortcutLoadingState.quickAnalysis = true;
    setShortcutLoading("quick-analysis", true);
    vscode.postMessage({ type: "executarAnaliseRapida" });
  });

  architetureAnalysisBtn?.addEventListener("click", () => {
    if (shortcutLoadingState.architectureAnalysis) return;
    shortcutLoadingState.architectureAnalysis = true;
    setShortcutLoading("architecture-analysis", true);
    vscode.postMessage({
      type: "enviarPergunta",
      value: "Realize uma análise arquitetural deste código.",
      selectedView: currentView,
      agentId: selectedModel ? selectedModel.id : null,
    });
  });

  function enviarPergunta() {
    const texto = input.value.trim();
    if (!texto) return;
    addMessage(texto, "user");
    showLoading();
    vscode.postMessage({ type: "enviarPergunta", value: texto, selectedView: currentView, agentId: selectedModel?.id ?? null });
    input.value = "";
    agentPopover?.classList.add("hidden");
  }

  btn.addEventListener("click", enviarPergunta);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") enviarPergunta(); });
}

// ── Message helpers ────────────────────────────────────────────────────────────

function addMessage(content, type, isMarkdown = false) {
  const chatContainer = getChatContainer();
  if (!chatContainer) return null;
  const div = document.createElement("div");
  div.className = "message " + type;
  if (isMarkdown && typeof marked !== "undefined") {
    div.innerHTML = marked.parse(content);
  } else {
    div.textContent = content;
  }
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

function showLoading() {
  const chatContainer = getChatContainer();
  if (!chatContainer) return;
  const div = document.createElement("div");
  div.className = "message bot loading";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  const text = document.createElement("span");
  text.textContent = "Gerando resposta...";
  div.appendChild(spinner);
  div.appendChild(text);
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  loadingElement = div;
}

function removeLoading() {
  const chatContainer = getChatContainer();
  if (loadingElement && chatContainer && loadingElement.parentNode === chatContainer) {
    chatContainer.removeChild(loadingElement);
  }
  loadingElement = null;
}

// ── Config / Library views ────────────────────────────────────────────────────

function renderConfigView() {
  currentView = "config";
  contentContainer.innerHTML = `
    <div id="settings-view">
      <button id="keys-btn" class="settings-option">Chaves de API</button>
    </div>
  `;
  document.getElementById("keys-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "abrirPainelConfig", selectedView: "config" });
  });
}

function renderLibraryView() {
  currentView = "library";
  contentContainer.innerHTML = "";
  vscode.postMessage({ type: "abrirPainelConfig", selectedView: "library" });
}

// ── Navbar wiring ─────────────────────────────────────────────────────────────

configBtn?.addEventListener("click", () => { renderConfigView(); updateActiveTab("config-panel-btn"); });
chatgBtn?.addEventListener("click", () => { renderChatView(); updateActiveTab("chat-btn"); });
libraryBtn?.addEventListener("click", () => { renderLibraryView(); updateActiveTab("library-btn"); });
searchBtn?.addEventListener("click", () => { updateActiveTab("search-btn"); });

// ── Message bus ───────────────────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "novaResposta": {
      removeLoading();
      shortcutLoadingState.architectureAnalysis = false;
      setShortcutLoading("architecture-analysis", false);
      addMessage(message.value, "bot", true);
      break;
    }
    case "respostaParcial": {
      removeLoading();
      if (!mensagemAtualBot) { bufferResposta = ""; mensagemAtualBot = addMessage("", "bot", true); }
      bufferResposta += message.value;
      if (mensagemAtualBot) {
        mensagemAtualBot.innerHTML = typeof marked !== "undefined" ? marked.parse(bufferResposta) : bufferResposta;
      }
      getChatContainer()?.scrollTo(0, getChatContainer().scrollHeight);
      break;
    }
    case "fimResposta": {
      mensagemAtualBot = null;
      bufferResposta = "";
      break;
    }
    case "erro": {
      removeLoading();
      mensagemAtualBot = null;
      bufferResposta = "";
      isLoadingCloudModels = false;
      shortcutLoadingState.quickAnalysis = false;
      shortcutLoadingState.architectureAnalysis = false;
      setShortcutLoading("quick-analysis", false);
      setShortcutLoading("architecture-analysis", false);
      addMessage(message.value || "Ocorreu um erro.", "bot");
      break;
    }
    case "analiseRapidaStatus": {
      const isLoading = !!message.value?.loading;
      shortcutLoadingState.quickAnalysis = isLoading;
      setShortcutLoading("quick-analysis", isLoading);
      break;
    }
    case "analiseRapidaConcluida": {
      shortcutLoadingState.quickAnalysis = false;
      setShortcutLoading("quick-analysis", false);
      break;
    }
    case "informarLLMsCarregados": {
      hydratemodelsDataFromBackend(message.value);
      break;
    }
    case "modelosCloudCarregados": {
      const { providerId, models } = message.value;
      if (modelsData[providerId]) modelsData[providerId].models = models;
      isLoadingCloudModels = false;
      if (selectedMode === "cloud" && selectedProvider === providerId) {
        const prevId = selectedModel?.id;
        selectedModel = models.find((m) => m.id === prevId) || models[0] || null;
        updateMainButton();
        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden")) renderPopoverContent();
      }
      break;
    }

    // ── Session messages ────────────────────────────────────────────────────

    case "sessoesListadas": {
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.activeSessionId;

      // If no active session exists yet, auto-create one
      if (!activeSessionId && activeSessions.length === 0) {
        vscode.postMessage({ type: "criarSessao", title: "Sessão Inicial" });
        return;
      }

      renderSessionList();

      if (message.value.activeSession) {
        loadChatMessages(message.value.activeSession);
      }
      break;
    }

    case "sessaoCriada": {
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      renderSessionList();
      loadChatMessages(message.value.session);
      break;
    }

    case "sessaoTrocada": {
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.session.id;
      renderSessionList();
      loadChatMessages(message.value.session);
      break;
    }

    case "sessaoExcluida": {
      activeSessions = message.value.sessions || [];
      activeSessionId = message.value.activeSession?.id || null;
      renderSessionList();
      if (message.value.activeSession) {
        loadChatMessages(message.value.activeSession);
      } else {
        // All sessions deleted — create a fresh one automatically
        vscode.postMessage({ type: "criarSessao", title: "Nova Sessão" });
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

// ── Shortcuts helpers ─────────────────────────────────────────────────────────

function getShortcutButton(action) {
  if (action === "quick-analysis") return document.getElementById("quick-analysis-btn");
  if (action === "architecture-analysis") return document.getElementById("architeture-analysis-btn");
  return null;
}

function setShortcutLoading(action, isLoading) {
  const button = getShortcutButton(action);
  if (!button) return;
  const originalLabel = button.dataset.originalLabel?.trim() || button.textContent.trim();
  if (!button.dataset.originalLabel) button.dataset.originalLabel = originalLabel;
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
  if (isLoading) {
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${originalLabel}</span>`;
  } else {
    button.textContent = button.dataset.originalLabel;
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

// ── Init ──────────────────────────────────────────────────────────────────────

renderChatView();
updateActiveTab("chat-btn");
updateMainButton();
vscode.postMessage({ type: "carregarLLMs" });