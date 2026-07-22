// Responsabilidade: fornece helpers de escape, formatacao e normalizacao de texto.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function getFieldValue(value, fallback = "Não informado") {
  return value === null || value === undefined || String(value).trim() === ""
    ? fallback
    : String(value).trim();
}

function isMissingInfoValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/ÃƒÆ’Ã‚Â£|ÃƒÂ£/gi, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return /^nao informado$/i.test(normalized);
}

function renderMarkdown(value) {
  const markdown = String(value ?? "").trim();

  if (!markdown) {
    return "";
  }

  if (typeof marked === "undefined") {
    return `<p>${escapeHtml(markdown).replace(/\n/g, "<br />")}</p>`;
  }

  return marked.parse(escapeHtml(markdown));
}

function formatDate(value) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getSearchErrorMessage(value) {
  if (typeof value === "string") {
    return value;
  }

  return value?.message || "Não foi possível buscar modelos no Hugging Face.";
}
