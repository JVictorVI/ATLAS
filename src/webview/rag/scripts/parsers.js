// Responsabilidade: normaliza listas de caminhos, extensoes e filtros simples.
function parseIgnoredPaths(value) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseExtensions(value) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,|\s+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => (item.startsWith(".") ? item : `.${item}`))
        .filter((item) => /^\.[a-z0-9][a-z0-9._+-]*$/i.test(item)),
    ),
  );
}

function parseSimpleList(value) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}
