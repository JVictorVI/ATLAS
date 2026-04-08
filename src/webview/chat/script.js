const vscode = acquireVsCodeApi();

const contentContainer = document.getElementById("content-container");
const chatgBtn = document.getElementById("chat-btn");
const libraryBtn = document.getElementById("library-btn");
const searchBtn = document.getElementById("search-btn");
const configBtn = document.getElementById("config-panel-btn");

let currentView = "chat";
let loadingElement = null;
let mensagemAtualBot = null;
let bufferResposta = "";

const agentData = {
  openai: { 
    name: "OpenAI", 
    type: "cloud",
    models: [
      { id: "gpt-4.1", name: "GPT 4.1" }, 
      { id: "gpt-3.5-turbo", name: "GPT 3.5 Turbo" }
    ] 
  },
  local: { 
    name: "Local Agent", 
    type: "local",
    models: [
      { id: "qwen-3-12b", name: "Qwen 3 12B" }, 
      { id: "llama-3-8b", name: "Llama 3 8B" }
    ] 
  }
};

let selectedProvider = "local";
let selectedModel = agentData["local"].models[0];

document.addEventListener("click", (e) => {
  const popover = document.getElementById("agent-popover");
  const btn = document.getElementById("open-popover");
  
  document.querySelectorAll('.dropdown-list').forEach(list => {
      list.classList.add('hidden');
  });

  if (popover && btn && !popover.classList.contains("hidden")) {
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      popover.classList.add("hidden");
    }
  }
});

function updateActiveTab(activeId) {
  document.querySelectorAll('.navbar button').forEach(btn => {
    btn.classList.remove('active');
  });

  const activeBtn = document.getElementById(activeId);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }
}

function getChatContainer() {
  return document.getElementById("chat-container");
}

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
                    <span id="main-btn-text">${selectedModel.name}</span>
                    <i class="codicon codicon-screenfull" style="font-size: 14px; margin-left: 4px;"></i>
                </div>
                
                <div class="action-buttons">
                    <button class="action-btn">Analisar Arquitetura do Código</button>
                    <button class="action-btn">Procurar violações</button>
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
}

// Função auxiliar para enviar a escolha ao VS Code
function salvarAgenteBackend() {
    vscode.postMessage({
        type: "salvarAgente",
        payload: {
            provider: selectedProvider,
            model: selectedModel
        }
    });
}

function renderPopoverContent() {
    const popover = document.getElementById("agent-popover");
    if (!popover) return;

    // Identifica se o agente atual é 'local' ou 'cloud'
    const currentType = selectedProvider ? agentData[selectedProvider].type : "local";
    let providerText = selectedProvider ? agentData[selectedProvider].name : "Selecione um provedor";
    let modelText = selectedModel ? selectedModel.name : "Selecione um modelo";

    // Filtra para mostrar apenas provedores da aba selecionada (PC ou Nuvem)
    const filteredProviders = Object.entries(agentData).filter(([key, val]) => val.type === currentType);

    popover.innerHTML = `
        <div class="popover-header">
            <button class="popover-icon-btn ${currentType === 'local' ? 'active' : ''}" id="tab-local" title="Agente Local">
                <i class="codicon codicon-device-desktop"></i>
            </button>
            <div class="popover-separator"></div>
            <button class="popover-icon-btn ${currentType === 'cloud' ? 'active' : ''}" id="tab-cloud" title="Nuvem">
                <i class="codicon codicon-cloud"></i>
            </button>
        </div>

        <div class="custom-dropdown">
            <button class="popover-dropdown-btn" id="btn-provider">
                <span>${providerText}</span>
                <i class="codicon codicon-chevron-down"></i>
            </button>
            <div class="dropdown-list hidden" id="list-provider">
                ${filteredProviders.map(([key, val]) => `<div class="dropdown-item provider-item" data-value="${key}">${val.name}</div>`).join('')}
            </div>
        </div>

        ${selectedProvider ? `
        <div class="custom-dropdown">
            <button class="popover-dropdown-btn" id="btn-model">
                <span>${modelText}</span>
                <i class="codicon codicon-chevron-down"></i>
            </button>
            <div class="dropdown-list hidden" id="list-model">
                ${agentData[selectedProvider].models.map(m => `<div class="dropdown-item model-item" data-value="${m.id}" data-name="${m.name}">${m.name}</div>`).join('')}
            </div>
        </div>
        ` : ''}
    `;

    // --- Eventos das Abas (Ícones) ---
    document.getElementById("tab-local")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentType !== "local") {
            selectedProvider = "local";
            selectedModel = agentData["local"].models[0];
            renderPopoverContent();
            updateMainButton();
            salvarAgenteBackend();
        }
    });

    document.getElementById("tab-cloud")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentType !== "cloud") {
            selectedProvider = "openai"; // Muda automaticamente para um de nuvem
            selectedModel = agentData["openai"].models[0];
            renderPopoverContent();
            updateMainButton();
            salvarAgenteBackend();
        }
    });

    // --- Eventos do Provedor ---
    const btnProvider = document.getElementById("btn-provider");
    const listProvider = document.getElementById("list-provider");

    btnProvider?.addEventListener("click", (e) => {
        e.stopPropagation();
        listProvider.classList.toggle("hidden");
        document.getElementById("list-model")?.classList.add("hidden"); 
    });

    document.querySelectorAll(".provider-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedProvider = item.getAttribute("data-value");
            selectedModel = agentData[selectedProvider].models[0]; 
            renderPopoverContent(); 
            updateMainButton(); 
            salvarAgenteBackend();
        });
    });

    // --- Eventos do Modelo ---
    const btnModel = document.getElementById("btn-model");
    const listModel = document.getElementById("list-model");

    btnModel?.addEventListener("click", (e) => {
        e.stopPropagation();
        listModel.classList.toggle("hidden");
        document.getElementById("list-provider")?.classList.add("hidden"); 
    });

    document.querySelectorAll(".model-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedModel = {
                id: item.getAttribute("data-value"),
                name: item.getAttribute("data-name")
            };
            listModel.classList.add("hidden"); 
            renderPopoverContent(); 
            updateMainButton(); 
            salvarAgenteBackend();
        });
    });
}

function updateMainButton() {
    const mainBtnText = document.getElementById("main-btn-text");
    if (mainBtnText && selectedModel) {
        mainBtnText.textContent = selectedModel.name;
    }
}

function renderConfigView() {
  currentView = "config";

  vscode.postMessage({
    type: "abrirPainelConfig",
    selectedView: currentView,
  });

  contentContainer.innerHTML = `
        <div id="settings-view">
            <button id="rag-btn" class="settings-option">Configurações de RAG</button>
            <button id="keys-btn" class="settings-option">Chaves de API</button>
        </div>
    `;
}

function setupChatEvents() {
  const input = document.getElementById("pergunta");
  const btn = document.getElementById("send-btn");
  const popoverBtn = document.getElementById("open-popover");
  const agentPopover = document.getElementById("agent-popover");

  if (!input || !btn) return;

  if (popoverBtn && agentPopover) {
      popoverBtn.addEventListener("click", (e) => {
          e.stopPropagation(); 
          
          if (agentPopover.classList.contains("hidden")) {
              agentPopover.classList.remove("hidden");
              renderPopoverContent(); 
          } else {
              agentPopover.classList.add("hidden");
          }
      });
  }

  function enviarPergunta() {
    const texto = input.value.trim();
    if (!texto) return;

    addMessage(texto, "user");
    showLoading();

    vscode.postMessage({
      type: "enviarPergunta",
      value: texto,
      selectedView: currentView,
      agentId: selectedModel ? selectedModel.id : null
    });

    input.value = "";
    agentPopover?.classList.add("hidden"); 
  }

  btn.addEventListener("click", enviarPergunta);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      enviarPergunta();
    }
  });
}

renderChatView();
updateActiveTab("chat-btn");
updateMainButton(); 

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

  if (
    loadingElement &&
    chatContainer &&
    loadingElement.parentNode === chatContainer
  ) {
    chatContainer.removeChild(loadingElement);
  }

  loadingElement = null;
}

configBtn?.addEventListener("click", () => {
  renderConfigView();
  updateActiveTab("config-panel-btn");
});

chatgBtn?.addEventListener("click", () => {
  renderChatView();
  updateActiveTab("chat-btn");
});

libraryBtn?.addEventListener("click", () => {
    updateActiveTab("library-btn");
});

searchBtn?.addEventListener("click", () => {
    updateActiveTab("search-btn");
});

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "agenteCarregado": {
      if (message.value) {
        selectedProvider = message.value.provider || "local";
        selectedModel = message.value.model || agentData["local"].models[0];
        updateMainButton();
        const popover = document.getElementById("agent-popover");
        if (popover && !popover.classList.contains("hidden")) {
            renderPopoverContent();
        }
      }
      break;
    }
    case "novaResposta": {
      removeLoading();
      addMessage(message.value, "bot", true);
      break;
    }
    case "respostaParcial": {
      removeLoading();
      if (!mensagemAtualBot) {
        bufferResposta = "";
        mensagemAtualBot = addMessage("", "bot", true);
      }
      bufferResposta += message.value;
      if (mensagemAtualBot) {
        mensagemAtualBot.innerHTML =
          typeof marked !== "undefined"
            ? marked.parse(bufferResposta)
            : bufferResposta;
      }
      const chatContainer = getChatContainer();
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
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
      addMessage(message.value || "Ocorreu um erro.", "bot");
      break;
    }
  }
});

// Assim que o script iniciar, pede ao VS Code para carregar a última escolha
vscode.postMessage({ type: "carregarAgente" });