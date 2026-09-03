const PARAMETER_UNIT_LABELS: Record<string, string> = {
  m: "M",
  million: "M",
  millions: "M",
  b: "B",
  billion: "B",
  billions: "B",
  t: "T",
  trillion: "T",
  trillions: "T",
};

const PARAMETER_UNIT_PATTERN =
  "(?:millions?|billions?|trillions?|[mbt])";

export function inferParameterCountFromFileName(fileName: string): string {
  const normalizedFileName = fileName.normalize("NFKC");
  const mixtureMatch = normalizedFileName.match(
    new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${PARAMETER_UNIT_PATTERN})(?=$|[^a-z])`,
      "i",
    ),
  );

  if (mixtureMatch) {
    return `${normalizeParameterNumber(mixtureMatch[1])}x${normalizeParameterNumber(mixtureMatch[2])}${normalizeParameterUnit(mixtureMatch[3])}`;
  }

  const parameterMatch = normalizedFileName.match(
    new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*[-_]?\\s*(${PARAMETER_UNIT_PATTERN})(?=$|[^a-z])`,
      "i",
    ),
  );

  if (!parameterMatch) {
    return "Não identificado";
  }

  return `${normalizeParameterNumber(parameterMatch[1])}${normalizeParameterUnit(parameterMatch[2])}`;
}

function normalizeParameterNumber(value: string): string {
  const parsedValue = Number(value.replace(",", "."));
  return Number.isFinite(parsedValue) ? String(parsedValue) : value;
}

function normalizeParameterUnit(value: string): string {
  return PARAMETER_UNIT_LABELS[value.toLowerCase()] ?? value.toUpperCase();
}
