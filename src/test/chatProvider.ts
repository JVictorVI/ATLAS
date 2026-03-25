import * as vscode from "vscode";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "atlas-chat.view";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Escuta mensagens da interface
    webviewView.webview.onDidReceiveMessage((data) => {
      if (data.type === "enviarPergunta") {
        console.log("Pergunta recebida da interface:", data.value);
      }
    });
  }


  private _getHtmlForWebview(webview: vscode.Webview) {
    return `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' ${webview.cspSource};">
            <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
            <style>
                :root {
                    --spacing: 12px;
                }
                body {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    margin: 0;
                    padding: 0;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-sideBar-background);
                }
                #chat-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--spacing);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .message {
                    max-width: 90%;
                    padding: 8px 12px;
                    border-radius: 8px;
                    line-height: 1.4;
                    word-wrap: break-word;
                }
                .user {
                    align-self: flex-end;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-bottom-right-radius: 2px;
                }
                .bot {
                    align-self: flex-start;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    color: var(--vscode-foreground);
                    border-bottom-left-radius: 2px;
                    border: 1px solid var(--vscode-widget-border);
                }
                .input-area {
                    padding: var(--spacing);
                    background-color: var(--vscode-sideBar-background);
                    border-top: 1px solid var(--vscode-widget-border);
                }
                .input-container {
                    display: flex;
                    gap: 8px;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 4px 8px;
                }
                .input-container:focus-within {
                    border-color: var(--vscode-focusBorder);
                }
                input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: var(--vscode-input-foreground);
                    outline: none;
                    padding: 4px 0;
                }
                #send-btn {
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: none;
                    border: none;
                    color: var(--vscode-icon-foreground);
                }
                #send-btn:hover { color: var(--vscode-button-background);
                
                .loading {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    opacity: 0.8;
                }

                .spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid var(--vscode-widget-border);
                    border-top: 2px solid var(--vscode-button-background);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                }
            </style>
        </head>
        <body>
            <div id="chat-container">
                <div class="message bot">Olá! Como posso ajudar com seu código hoje?</div>
            </div>
            <div class="input-area">
                <div class="input-container">
                    <input type="text" id="pergunta" placeholder="Pergunte ao ATLAS" />
                    <button id="send-btn" title="Enviar">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M1.176 8.005L14.804 1 13 15l-4.5-4.5-2 2V9l-5.324-.995z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');
                const input = document.getElementById('pergunta');
                const btn = document.getElementById('send-btn');

                let loadingElement = null;
                let mensagemAtualBot = null;
                let bufferResposta = '';

                function addMessage(content, type, isMarkdown = false) {
                    const div = document.createElement('div');
                    div.className = 'message ' + type;

                    if (isMarkdown) {
                        div.innerHTML = marked.parse(content);
                    } else {
                        div.textContent = content;
                    }

                    chatContainer.appendChild(div);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    return div;
                }

                function showLoading() {
                    const div = document.createElement('div');
                    div.className = 'message bot loading';

                    const spinner = document.createElement('div');
                    spinner.className = 'spinner';

                    const text = document.createElement('span');
                    text.textContent = 'Gerando resposta...';

                    div.appendChild(spinner);
                    div.appendChild(text);

                    chatContainer.appendChild(div);
                    chatContainer.scrollTop = chatContainer.scrollHeight;

                    loadingElement = div;
                }

                function removeLoading() {
                    if (loadingElement) {
                        chatContainer.removeChild(loadingElement);
                        loadingElement = null;
                    }
                }

                function enviar() {
                    const text = input.value.trim();
                    if (!text) return;

                    addMessage(text, 'user');
                    showLoading();

                    vscode.postMessage({ type: 'enviarPergunta', value: text });
                    input.value = '';
                }

                btn.onclick = enviar;
                input.onkeypress = (e) => { if (e.key === 'Enter') enviar(); };
            </script>
        </body>
        </html>`;
  }
}