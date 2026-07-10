// Responsabilidade: inicializa a tela e roteia mensagens recebidas da extensao.
function initializeApiKeysView() {
  setupCredentialEvents();
  setupCloudConfigEvents();
  setupBehaviorSettings();
  updateBehaviorState();

  vscode.postMessage({ type: "listarChaves" });
  vscode.postMessage({ type: "carregarConfiguracoesCloud" });
  vscode.postMessage({ type: "carregarComportamentoModelo" });
}

function handleApiKeysMessage(event) {
  const message = event.data || {};

  switch (message.type) {
    case "credenciaisAtualizadas":
      renderCredentials(message.value);
      break;

    case "configuracoesCloudCarregadas":
      fillCloudConfigs(message.value);
      deactivateInputs();
      break;

    case "configuracoesCloudSalvas":
      fillCloudConfigs(message.value);
      deactivateInputs();
      break;

    case "comportamentoModeloCarregado":
      applyBehavior(message.value);
      break;

    case "comportamentoModeloSalvo":
      applyBehavior(message.value);
      showButtonFeedback(apiKeyElements.savePromptBtn, "Salvo!");
      break;

    default:
      break;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApiKeysView, {
    once: true,
  });
} else {
  initializeApiKeysView();
}

window.addEventListener("message", handleApiKeysMessage);
