// Responsabilidade: controla o estado visual de carregamento inicial da pagina.
function setAtlasLoading(loading) {
  document.body.classList.toggle("atlas-loading-active", loading);

  if (atlasLoading) {
    atlasLoading.hidden = !loading;
  }

  if (atlasSettingsPage) {
    atlasSettingsPage.setAttribute("aria-busy", loading ? "true" : "false");

    if (loading) {
      atlasSettingsPage.setAttribute("aria-hidden", "true");
    } else {
      atlasSettingsPage.removeAttribute("aria-hidden");
    }
  }
}

function releaseAtlasLoading() {
  initialAtlasSettingsLoaded = true;
  window.clearTimeout(initialAtlasSettingsTimeout);
  setAtlasLoading(false);
}
