// Responsabilidade: utilitarios pequenos de DOM e sanitizacao de texto.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readOptionalNumber(input) {
  const value = input?.value ? Number(input.value) : undefined;

  return Number.isFinite(value) ? value : undefined;
}

function setChecked(input, value) {
  if (input) {
    input.checked = Boolean(value);
  }
}

function setInputValue(input, value) {
  if (input && value !== undefined) {
    input.value = String(value);
  }
}

function showButtonFeedback(button, temporaryText) {
  if (!button) {
    return;
  }

  const originalText = button.textContent;
  button.textContent = temporaryText;

  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
}
