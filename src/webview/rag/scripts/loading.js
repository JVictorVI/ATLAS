// Responsabilidade: controla overlay de carregamento inicial e disponibilidade RAG.
function setRagLoading(loading) {
  document.body.classList.toggle("rag-loading-active", loading);

  if (ragLoading) {
    ragLoading.hidden = !loading;
  }

  if (ragPage) {
    ragPage.setAttribute("aria-busy", loading ? "true" : "false");

    if (loading) {
      ragPage.setAttribute("aria-hidden", "true");
    } else {
      ragPage.removeAttribute("aria-hidden");
    }
  }
}

function releaseRagLoadingWithError(message) {
  initialRagStateLoaded = true;
  window.clearTimeout(initialRagStateTimeout);
  setRagLoading(false);
  showFeedback(message, "error");

  const runtimeStatus = document.getElementById("rag-runtime-status");

  if (runtimeStatus) {
    runtimeStatus.textContent = "Não foi possível verificar o ChromaDB.";
  }
}

function updateRagDestinationAvailability() {
  const enabled = ragEnabledInput?.checked === true;
  ragDestinationSuboptions?.classList.toggle("is-disabled", !enabled);
  ragDestinationSuboptions?.setAttribute(
    "aria-disabled",
    enabled ? "false" : "true",
  );

  if (localRagEnabledInput) {
    localRagEnabledInput.disabled = !enabled;
  }

  if (cloudRagEnabledInput) {
    cloudRagEnabledInput.disabled = !enabled;
  }

  if (codeEditingRagInput) {
    codeEditingRagInput.disabled = !enabled;
  }
}
