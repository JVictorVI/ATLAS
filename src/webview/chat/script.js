const vscode = acquireVsCodeApi();

const contentContainer = document.getElementById("content-container");
const chatgBtn = document.getElementById("chat-btn");
const configBtn = document.getElementById("config-panel-btn");

let currentView = "chat";
let loadingElement = null;
let mensagemAtualBot = null;
let bufferResposta = "";

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
            <div class="model-selector">
                <div class="model-tag">
                    <i class="codicon codicon-chevron-down"></i>
                    <span>Teste</span>
                </div>
                <i class="codicon codicon-screenfull" title="Tela cheia"></i>
            </div>

            <div class="input-container">
                <input type="text" id="pergunta" placeholder="Pergunte ao ATLAS" />
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

  if (!input || !btn) return;

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

renderChatView();

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
});

chatgBtn?.addEventListener("click", () => {
  renderChatView();
});

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
