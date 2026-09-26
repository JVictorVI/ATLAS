const MAX_QUERY_CHARACTERS = 1200;
const MIN_PREFERRED_CHUNK_CHARACTERS = 600;

/** Covers the entire editor code without cutting through a line when possible. */
export function buildArchitectureRagQueries(
  code: string,
  symbolStartLines: number[] = [],
): string[] {
  const normalized = code.replace(/\r\n?/g, "\n");

  if (!normalized.trim()) {
    return [];
  }

  const lineStarts = [0];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  const symbolBoundaries = [...new Set(
    symbolStartLines
      .filter((line) => Number.isInteger(line) && line > 1)
      .map((line) => lineStarts[line - 1])
      .filter((offset): offset is number => offset !== undefined),
  )].sort((left, right) => left - right);
  const queries: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const maxEnd = Math.min(start + MAX_QUERY_CHARACTERS, normalized.length);
    let end = maxEnd;

    if (maxEnd < normalized.length) {
      const minimumEnd = start + MIN_PREFERRED_CHUNK_CHARACTERS;
      let symbolEnd: number | undefined;
      for (let index = symbolBoundaries.length - 1; index >= 0; index -= 1) {
        const boundary = symbolBoundaries[index];
        if (boundary <= maxEnd) {
          symbolEnd = boundary >= minimumEnd ? boundary : undefined;
          break;
        }
      }
      const lineEnd = normalized.lastIndexOf("\n", maxEnd - 1) + 1;
      end = symbolEnd ?? (lineEnd >= minimumEnd ? lineEnd : maxEnd);
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      queries.push(chunk);
    }
    start = end;
  }

  return queries;
}
