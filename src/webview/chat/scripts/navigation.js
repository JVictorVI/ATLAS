// Responsabilidade: utilitarios de navegacao, scroll e renderizacao da tela de chat.
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
  hydrateChatControlState();
  requestLatestLlmState();

  // Request sessions from backend on first render
  vscode.postMessage({ type: "listarSessoes" });
  vscode.postMessage({ type: "consultarMarcacoesAnaliseRapida" });
}

// ── Model popover ─────────────────────────────────────────────────────────────
