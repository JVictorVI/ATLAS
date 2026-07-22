// Responsabilidade: compoe o layout principal e reativa eventos apos cada render.
function render() {
  root.innerHTML = `
    <div class="search-layout ${state.detailOnly ? "detail-only-layout" : ""}">
      ${state.detailOnly ? "" : renderSidebar()}
      <main class="search-detail">
        ${renderDetails()}
      </main>
    </div>
  `;

  bindEvents();
}
