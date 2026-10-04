import type { RagSearchResult } from "../interfaces/AtlasRagTypes";
import { addCodeLineNumbers } from "./AtlasCodeContext";

export function formatRagCodeContent(
  result: Pick<RagSearchResult, "content" | "sourceType" | "startLine" | "endLine">,
  sourceContent?: string,
): string | null {
  if (result.sourceType !== "code") {
    return result.content;
  }

  const firstLine = result.startLine;
  const lastLine = result.endLine;
  if (
    typeof firstLine !== "number" ||
    !Number.isInteger(firstLine) ||
    firstLine < 1 ||
    typeof lastLine !== "number" ||
    !Number.isInteger(lastLine) ||
    lastLine < firstLine
  ) {
    return null;
  }

  // Index headers are metadata, not source lines.
  const header = result.content.match(
    /^Arquivo: [^\r\n]*\nLinguagem: [^\r\n]*\nLinhas: \d+-\d+\n\n/,
  )?.[0] ?? "";
  let code = result.content.slice(header.length).replace(/\r\n|\r/g, "\n");

  // Older indexes trimmed the chunk, losing blank lines and edge indentation.
  // Restore them only when the original range still matches the indexed text.
  if (sourceContent !== undefined) {
    const sourceLines = sourceContent.split(/\r\n|\r|\n/);
    const originalCode = sourceLines.slice(firstLine - 1, lastLine).join("\n");
    if (lastLine <= sourceLines.length && originalCode.trim() === code.trim()) {
      code = originalCode;
    }
  }

  if (code.split("\n").length !== lastLine - firstLine + 1) {
    return null;
  }

  return [
    ...(header ? [header.trimEnd()] : []),
    "Código numerado:",
    addCodeLineNumbers(code, firstLine),
  ].join("\n");
}
