const vscode = acquireVsCodeApi();

window.addEventListener("DOMContentLoaded", () => {
  const addKeyBtn = document.getElementById("add-key-btn");
  const saveSecurityBtn = document.getElementById("save-security-btn");

  if (addKeyBtn) {
    addKeyBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "adicionarChave" });
    });
  }

  if (saveSecurityBtn) {
    saveSecurityBtn.addEventListener("click", saveCloudSecuritySettings);
  }

  vscode.postMessage({ type: "listarChaves" });
  vscode.postMessage({ type: "carregarConfiguracoesSeguranca" });
});

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "credenciaisAtualizadas") {
    renderCredentials(message.value);
  }

  if (message.type === "configuracoesSegurancaCarregadas") {
    fillCloudSecuritySettings(message.value);
    deactivateInputs();
  }
});

function renderCredentials(credentials) {
  const tbody = document.getElementById("providers-tbody");
  const table = document.getElementById("providers-table");
  const emptyState = document.getElementById("empty-credentials-state");

  if (!tbody || !table || !emptyState) return;

  tbody.innerHTML = "";

  if (!credentials || credentials.length === 0) {
    table.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  table.style.display = "table";
  emptyState.style.display = "none";

  for (const item of credentials) {
    const tr = document.createElement("tr");

    const provider = escapeHtml(item.provider ?? "-");
    const maskedKey = escapeHtml(item.maskedKey ?? "Não configurada");
    const addedAt = escapeHtml(item.addedAt ?? "Não informado");

    tr.innerHTML = `
      <td>${provider}</td>
      <td>${maskedKey}</td>
      <td>${addedAt}</td>
      <td>
        <div class="actions">
          <button class="btn-secondary edit-key-btn" data-provider="${provider}">
            Editar
          </button>
          <button class="btn-danger delete-key-btn" data-provider="${provider}">
            Excluir
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }

  bindCredentialActions();
}

function bindCredentialActions() {
  const editButtons = document.querySelectorAll(".edit-key-btn");
  const deleteButtons = document.querySelectorAll(".delete-key-btn");

  editButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.getAttribute("data-provider");
      if (!provider) return;

      vscode.postMessage({
        type: "editarChave",
        provider,
      });
    });
  });

  deleteButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.getAttribute("data-provider");
      if (!provider) return;

      vscode.postMessage({
        type: "excluirChave",
        provider,
      });
    });
  });
}

function fillCloudSecuritySettings(settings) {
  if (!settings) return;

  const confirmCloud = document.getElementById("confirmCloud");
  const blockRag = document.getElementById("blockRag");
  const limitPayload = document.getElementById("limitPayload");
  const maxTokens = document.getElementById("maxTokens");
  const timeout = document.getElementById("timeout");

  if (confirmCloud) confirmCloud.checked = Boolean(settings.confirmCloud);
  if (blockRag) blockRag.checked = Boolean(settings.blockRag);
  if (limitPayload) limitPayload.checked = Boolean(settings.limitPayload);

  if (maxTokens && settings.maxTokens !== undefined) {
    maxTokens.value = String(settings.maxTokens);
  }

  if (timeout && settings.timeout !== undefined) {
    timeout.value = String(settings.timeout);
  }
}

function saveCloudSecuritySettings() {
  const confirmCloud = document.getElementById("confirmCloud");
  const blockRag = document.getElementById("blockRag");
  const limitPayload = document.getElementById("limitPayload");
  const maxTokens = document.getElementById("maxTokens");
  const timeout = document.getElementById("timeout");

  vscode.postMessage({
    type: "salvarConfiguracoesSeguranca",
    payload: {
      confirmCloud: Boolean(confirmCloud?.checked),
      blockRag: Boolean(blockRag?.checked),
      limitPayload: Boolean(limitPayload?.checked),
      maxTokens: maxTokens?.value ? Number(maxTokens.value) : undefined,
      timeout: timeout?.value ? Number(timeout.value) : undefined,
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deactivateInputs() {
  const inputs = document.querySelectorAll("#timeout, #maxTokens");
  const limitPayload = document.getElementById("limitPayload");

  const enabled = Boolean(limitPayload?.checked);

  inputs.forEach((input) => {
    input.disabled = !enabled;
  });
}

document
  .getElementById("limitPayload")
  .addEventListener("change", deactivateInputs);
