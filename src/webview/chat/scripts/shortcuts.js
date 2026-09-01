// Responsabilidade: controla atalhos de analise e bootstrap inicial.
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
