// Responsabilidade: renderiza provedores cadastrados e despacha acoes de chave.
function setupCredentialEvents() {
  apiKeyElements.addKeyBtn?.addEventListener("click", () => {
    vscode.postMessage({ type: "adicionarChave" });
  });

  apiKeyElements.providersTbody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-credential-action]");

    if (!button) {
      return;
    }

    const provider = button.getAttribute("data-provider");
    const action = button.getAttribute("data-credential-action");

    if (!provider) {
      return;
    }

    vscode.postMessage({
      type: action === "delete" ? "excluirChave" : "editarChave",
      provider,
    });
  });
}

function renderCredentials(credentials) {
  const { emptyCredentialsState, providersTable, providersTbody } =
    apiKeyElements;

  if (!providersTbody || !providersTable || !emptyCredentialsState) {
    return;
  }

  providersTbody.textContent = "";

  if (!credentials || credentials.length === 0) {
    providersTable.style.display = "none";
    emptyCredentialsState.style.display = "block";
    return;
  }

  providersTable.style.display = "table";
  emptyCredentialsState.style.display = "none";

  const rows = document.createDocumentFragment();

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
          <button class="btn-secondary" data-credential-action="edit" data-provider="${provider}">
            Editar
          </button>
          <button class="btn-danger" data-credential-action="delete" data-provider="${provider}">
            Excluir
          </button>
        </div>
      </td>
    `;

    rows.appendChild(tr);
  }

  providersTbody.appendChild(rows);
}
