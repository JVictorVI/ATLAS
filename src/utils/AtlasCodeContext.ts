import type { AtlasCodeContextSegment } from "../interfaces/AtlasEditorTypes";

export const omittedCodeMarker =
  "/* ... conteúdo omitido pelo perfil de contexto ... */";

export function addCodeLineNumbers(code: string, firstLine = 1): string {
  const lines = code.split(/\r\n|\r|\n/);
  const width = String(firstLine + lines.length - 1).length;

  return lines
    .map(
      (line, index) => `${String(firstLine + index).padStart(width, " ")} | ${line}`,
    )
    .join("\n");
}

export function truncateCodeContext(
  code: string,
  maxCharacters: number,
  firstLine = 1,
): { code: string; segments: AtlasCodeContextSegment[] } {
  if (code.length <= maxCharacters) {
    return { code, segments: [{ code, startLine: firstLine }] };
  }

  const marker = `\n\n${omittedCodeMarker}\n\n`;
  const available = Math.max(0, maxCharacters - marker.length);

  if (available <= 0) {
    const content = code.slice(0, maxCharacters);
    return { code: content, segments: [{ code: content, startLine: firstLine }] };
  }

  let headEnd = Math.ceil(available * 0.65);
  let tailStart = code.length - (available - headEnd);

  // Keep CRLF pairs intact when a character limit cuts through a line ending.
  if (code[headEnd - 1] === "\r" && code[headEnd] === "\n") {
    headEnd -= 1;
  }
  if (code[tailStart - 1] === "\r" && code[tailStart] === "\n") {
    tailStart += 1;
  }

  const segments: AtlasCodeContextSegment[] = [
    { code: code.slice(0, headEnd), startLine: firstLine },
  ];
  if (tailStart < code.length) {
    segments.push({
      code: code.slice(tailStart),
      startLine:
        firstLine + (code.slice(0, tailStart).match(/\r\n|\r|\n/g)?.length ?? 0),
    });
  }

  return {
    code: segments.map((segment) => segment.code).join(marker),
    segments,
  };
}
