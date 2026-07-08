// Responsabilidade: inicializa API do VS Code e centraliza referencias da tela.
const vscode = acquireVsCodeApi();

const apiKeyElements = {
  addKeyBtn: document.getElementById("add-key-btn"),
  dynamicMaxTokens: document.getElementById("dynamicMaxTokens"),
  emptyCredentialsState: document.getElementById("empty-credentials-state"),
  limitPayload: document.getElementById("limitPayload"),
  maxTokens: document.getElementById("maxTokens"),
  providersTable: document.getElementById("providers-table"),
  providersTbody: document.getElementById("providers-tbody"),
  savePromptBtn: document.getElementById("save-prompt-btn"),
  saveSecurityBtn: document.getElementById("save-security-btn"),
  stream: document.getElementById("stream"),
  systemPrompt: document.getElementById("system-prompt"),
  temperature: document.getElementById("temperature"),
  timeout: document.getElementById("timeout"),
  toggleCustom: document.getElementById("toggle-custom"),
  toggleDefault: document.getElementById("toggle-default"),
  topP: document.getElementById("topP"),
};
