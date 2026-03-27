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
    saveSecurityBtn.addEventListener("click", () => {
      vscode.postMessage({
        type: "salvarConfiguracoesSeguranca",
        payload: {
          confirmCloud:
            document.getElementById("confirmCloud")?.checked ?? false,
          blockRag: document.getElementById("blockRag")?.checked ?? false,
          limitPayload:
            document.getElementById("limitPayload")?.checked ?? false,
          maxTokens: document.getElementById("maxTokens")?.value ?? "",
          timeout: document.getElementById("timeout")?.value ?? "",
        },
      });
    });
  }

  vscode.postMessage({ type: "listarChaves" });
});

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "credenciaisAtualizadas") {
    renderCredentials(message.value);
  }

  if (message.type === "configuracoesSegurancaCarregadas") {
    fillSecuritySettings(message.value);
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

function fillSecuritySettings(settings) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
