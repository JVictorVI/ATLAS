// Responsabilidade: reune helpers pequenos de DOM, leitura de campos e formatacao.
function setElementText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function setText(id, text) {
  setElementText(document.getElementById(id), text);
}

function setChecked(input, checked) {
  if (input) {
    input.checked = checked;
  }
}

function setInputValue(input, value) {
  if (input) {
    input.value = String(value ?? "");
  }
}

function setPathValue(input, value) {
  if (!input) {
    return;
  }

  const path = value || "";
  input.value = path;
  input.title = path;
}

function setInputsDisabled(inputs, disabled) {
  inputs.forEach((input) => {
    if (input) {
      input.disabled = disabled;
    }
  });
}

function readOptionalNumber(input) {
  if (!input?.value) {
    return undefined;
  }

  const value = Number(input.value);
  return Number.isFinite(value) ? value : undefined;
}

function formatEnabled(enabled) {
  return enabled ? "ativada" : "desativada";
}

function formatNumber(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return String(value ?? "");
  }

  return new Intl.NumberFormat("pt-BR").format(parsed);
}
