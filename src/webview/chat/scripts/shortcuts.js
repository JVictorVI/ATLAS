// Responsabilidade: controla atalhos de analise, modo estudante e bootstrap inicial.
function getShortcutButton(action) {
  if (action === "quick-analysis")
    {return document.getElementById("quick-analysis-btn");}
  if (action === "architecture-analysis")
    {return document.getElementById("architeture-analysis-btn");}
  return null;
}

function getShortcutLoadingState(action) {
  if (action === "quick-analysis") {
    return shortcutLoadingState.quickAnalysis;
  }

  if (action === "architecture-analysis") {
    return shortcutLoadingState.architectureAnalysis;
  }

  return false;
}

function renderShortcutButton(action) {
  const button = getShortcutButton(action);
  if (!button) {return;}
  const originalLabel =
    button.dataset.originalLabel?.trim() || button.textContent.trim();
  if (!button.dataset.originalLabel)
    {button.dataset.originalLabel = originalLabel;}
  if (!button.dataset.originalTitle) {
    button.dataset.originalTitle = button.getAttribute("title") || "";
  }

  const isLoading = getShortcutLoadingState(action);
  const requiresEditorContext =
    action === "quick-analysis" || action === "architecture-analysis";
  const isUnavailable = requiresEditorContext && !hasEditorContextForAnalysis;
  const isBlocked =
    isUnavailable ||
    isLoading ||
    hasActiveShortcutLoading() ||
    isGeneratingResponse;

  button.disabled = isBlocked;
  button.classList.toggle("loading", isLoading);
  button.title = isUnavailable
    ? "Abra um arquivo no editor para executar esta análise."
    : button.dataset.originalTitle;
  if (isLoading) {
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${originalLabel}</span>`;
  } else {
    button.textContent = button.dataset.originalLabel;
  }
}

function renderShortcutButtons() {
  renderShortcutButton("quick-analysis");
  renderShortcutButton("architecture-analysis");
}

function setShortcutLoading() {
  renderShortcutButtons();
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

function showSessionsButton() {
  expandSidebarBtn?.classList.remove("hidden");
}

function hideSessionsButton() {
  expandSidebarBtn?.classList.add("hidden");
}

function closeSessionsSidebar() {
  sidebar?.classList.add("collapsed");
}
