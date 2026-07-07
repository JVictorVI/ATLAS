// Responsabilidade: conecta botoes da navbar as telas principais.
function bindNavButton(button, renderView, activeId, showSessions) {
  button?.addEventListener("click", () => {
    renderView();

    if (showSessions) {
      showSessionsButton();
    } else {
      hideSessionsButton();
    }

    closeSessionsSidebar();
    updateActiveTab(activeId);
  });
}

bindNavButton(configBtn, renderConfigView, "config-panel-btn", false);
bindNavButton(chatgBtn, renderChatView, "chat-btn", true);
bindNavButton(libraryBtn, renderLibraryView, "library-btn", false);
bindNavButton(searchBtn, () => renderSearchView(), "search-btn", false);
