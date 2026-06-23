const toast = document.getElementById("toast");
let toastTimer;

function showFeedback(message) {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

document.getElementById("rag-enabled")?.addEventListener("change", (event) => {
  showFeedback(event.target.checked ? "RAG habilitado" : "RAG desabilitado");
});

document
  .getElementById("cloud-rag-enabled")
  ?.addEventListener("change", (event) => {
    showFeedback(
      event.target.checked
        ? "Uso do RAG em nuvem habilitado"
        : "Uso do RAG em nuvem desabilitado",
    );
  });

document.getElementById("add-project")?.addEventListener("click", () => {
  showFeedback("A seleção de projetos será implementada em uma próxima etapa.");
});

document.getElementById("add-file")?.addEventListener("click", () => {
  showFeedback("O envio de documentos será implementado em uma próxima etapa.");
});

document.querySelectorAll(".btn-reindex").forEach((button) => {
  button.addEventListener("click", () => {
    showFeedback("Reindexação simulada para este protótipo.");
  });
});

document.querySelectorAll(".btn-delete").forEach((button) => {
  button.addEventListener("click", () => {
    showFeedback("Exclusão simulada para este protótipo.");
  });
});

document.querySelectorAll(".more-button").forEach((button) => {
  button.addEventListener("click", () => {
    showFeedback("Opções do documento ainda não disponíveis.");
  });
});
