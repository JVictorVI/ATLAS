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

// --- FUNÇÃO PARA ATUALIZAR O BOTÃO SELECIONADO ---
function updateActiveTab(activeId) {
  // Remove a classe 'active' de todos os botões da navbar
  document.querySelectorAll('.navbar button').forEach(btn => {
    btn.classList.remove('active');
  });

  // Adiciona a classe 'active' no botão que foi clicado
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

  // Inserimos a nova estrutura (top-controls, action-buttons e o agent-popover) aqui
  contentContainer.innerHTML = `
        <div id="chat-container">
            <div class="message bot">Olá! Como posso ajudar com seu código hoje?</div>
        </div>

        <div class="input-area">
            <div id="agent-popover" class="agent-popover hidden"></div>

            <div class="top-controls">
                <div class="model-selector" id="open-popover" title="Selecionar Agente">
                    <i class="codicon codicon-chevron-down"></i>
                    <span>Qwen 3 12B</span>
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

function renderConfigView() {
  currentView = "config";

  vscode.postMessage({
    type: "abrirPainelConfig",
    selectedView: currentView,
  });

  // 1. Adicionamos o botão "Configurações de Agente" aqui no HTML
  contentContainer.innerHTML = `
        <div id="settings-view">
            <button id="agent-settings-btn" class="settings-option">Configurações do Agente de IA</button>
            <button id="rag-btn" class="settings-option">Configurações de RAG</button>
            <button id="keys-btn" class="settings-option">Chaves de API</button>
        </div>
    `;

  // 2. Criamos o evento de clique que avisa o VS Code para abrir sua nova tela
  const agentSettingsBtn = document.getElementById("agent-settings-btn");
  if (agentSettingsBtn) {
      agentSettingsBtn.addEventListener("click", () => {
          vscode.postMessage({
              type: "abrirTelaAgente" // <-- Esse é o comando que sua extensão vai ouvir
          });
      });
  }
}

function setupChatEvents() {
  const input = document.getElementById("pergunta");
  const btn = document.getElementById("send-btn");
  
  // Pegamos os elementos novos que acabamos de renderizar
  const popoverBtn = document.getElementById("open-popover");
  const agentPopover = document.getElementById("agent-popover");

  if (!input || !btn) return;

  // --- Lógica de abrir/fechar o popover ---
// --- Lógica de abrir/fechar o popover ---
  if (popoverBtn && agentPopover) {
      popoverBtn.addEventListener("click", (e) => {
          e.stopPropagation(); 
          
          if (agentPopover.classList.contains("hidden")) {
              agentPopover.classList.remove("hidden");
              
              // Aqui injetamos o HTML exato da sua imagem!
              agentPopover.innerHTML = `
                <div class="popover-header">
                  <button class="popover-icon-btn" title="Local">
                    <i class="codicon codicon-device-desktop"></i>
                  </button>
                  <div class="popover-separator"></div>
                  <button class="popover-icon-btn active" title="Nuvem">
                    <i class="codicon codicon-cloud"></i>
                  </button>
                </div>
                
                <button class="popover-dropdown-btn" id="select-provider-btn">
                  <span>Selecione um provedor</span>
                  <i class="codicon codicon-chevron-down"></i>
                </button>
              `; 
          } else {
              agentPopover.classList.add("hidden");
          }
      });
  }

  // Fecha o popover se o usuário clicar em qualquer outro lugar da tela
  document.addEventListener("click", (e) => {
      if (agentPopover && popoverBtn && !popoverBtn.contains(e.target) && !agentPopover.contains(e.target)) {
          agentPopover.classList.add("hidden");
      }
  });

  function enviarPergunta() {
    const texto = input.value.trim();
    if (!texto) return;

    addMessage(texto, "user");
    showLoading();

    vscode.postMessage({
      type: "enviarPergunta",
      value: texto,
      selectedView: currentView,
    });

    input.value = "";
  }

  btn.addEventListener("click", enviarPergunta);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      enviarPergunta();
    }
  });
}

// Inicia na aba de chat e define o botão ativo
renderChatView();
updateActiveTab("chat-btn");

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

// --- CONFIGURAÇÃO DOS CLIQUES NOS ÍCONES DA NAVBAR ---

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

// --- COMUNICAÇÃO COM A EXTENSÃO ---
window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
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



