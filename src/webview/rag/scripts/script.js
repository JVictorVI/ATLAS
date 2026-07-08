// Responsabilidade: inicia carregamento inicial do estado RAG.
initialRagStateTimeout = window.setTimeout(() => {
  if (initialRagStateLoaded) {
    return;
  }

  releaseRagLoadingWithError(
    "O carregamento inicial do RAG demorou mais que o esperado. A tela foi liberada para você ajustar as configurações.",
  );
}, 10000);

vscode.postMessage({ type: "carregarEstadoRag" });
