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

function getSafeUrl(value, modelId = "") {
  const rawUrl = String(value ?? "").trim();

  if (!rawUrl) {
    return "";
  }

  if (rawUrl.startsWith("//")) {
    return `https:${rawUrl}`;
  }

  if (rawUrl.startsWith("/")) {
    return `https://huggingface.co${rawUrl}`;
  }

  try {
    const url = new URL(rawUrl);

    if (["http:", "https:", "data:"].includes(url.protocol)) {
      return url.toString();
    }

    return "";
  } catch {
    if (!modelId || rawUrl.startsWith("#")) {
      return rawUrl.startsWith("#") ? rawUrl : "";
    }

    const normalizedPath = rawUrl.replace(/^\.?\//, "");

    if (
      !normalizedPath ||
      normalizedPath.startsWith("../") ||
      normalizedPath.includes("/../")
    ) {
      return "";
    }

    return `https://huggingface.co/${modelId
      .split("/")
      .map(encodeURIComponent)
      .join("/")}/resolve/main/${normalizedPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  }
}

function sanitizeRenderedMarkdown(html, modelId = "") {
  const template = document.createElement("template");
  const allowedTags = new Set([
    "A",
    "B",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "COL",
    "COLGROUP",
    "DD",
    "DEL",
    "DETAILS",
    "DIV",
    "DL",
    "DT",
    "EM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "I",
    "IMG",
    "INS",
    "KBD",
    "LI",
    "OL",
    "P",
    "PRE",
    "S",
    "SMALL",
    "SPAN",
    "STRONG",
    "SUB",
    "SUMMARY",
    "SUP",
    "TABLE",
    "TBODY",
    "TD",
    "TFOOT",
    "TH",
    "THEAD",
    "TR",
    "U",
    "UL",
  ]);
  const allowedAttributes = new Set([
    "align",
    "alt",
    "aria-label",
    "class",
    "colspan",
    "height",
    "href",
    "id",
    "rowspan",
    "src",
    "style",
    "target",
    "title",
    "width",
  ]);

  template.innerHTML = html;

  template.content.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();

      if (
        attributeName.startsWith("on") ||
        !allowedAttributes.has(attributeName)
      ) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (attributeName === "href" || attributeName === "src") {
        const safeUrl = getSafeUrl(attribute.value, modelId);

        if (!safeUrl) {
          element.removeAttribute(attribute.name);
          return;
        }

        element.setAttribute(attribute.name, safeUrl);
      }

      if (attributeName === "style") {
        const safeStyle = attribute.value
          .replace(/expression\s*\([^)]*\)/gi, "")
          .replace(/url\s*\([^)]*\)/gi, "");

        element.setAttribute(attribute.name, safeStyle);
      }
    });

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }

    if (element.tagName === "IMG" && !element.getAttribute("alt")) {
      element.setAttribute("alt", "");
    }
  });

  return template.innerHTML;
}

function renderMarkdown(value, modelId = "") {
  const markdown = String(value ?? "").trim();

  if (!markdown) {
    return "";
  }

  if (typeof marked === "undefined") {
    return `<p>${escapeHtml(markdown).replace(/\n/g, "<br />")}</p>`;
  }

  return sanitizeRenderedMarkdown(marked.parse(markdown), modelId);
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
