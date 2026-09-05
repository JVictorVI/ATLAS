export function* chunkExternalDocument(
  content: string,
  configuredSize: number,
  configuredOverlap: number,
  firstLine: number,
): Generator<{ content: string; startLine: number; endLine: number }> {
  const size = Math.max(300, Math.floor(configuredSize));
  const overlap = Math.max(
    0,
    Math.min(Math.floor(configuredOverlap), Math.floor(size / 2)),
  );
  let start = 0;
  let line = firstLine;

  while (start < content.length) {
    let end = Math.min(start + size, content.length);
    if (end < content.length) {
      const newline = content.lastIndexOf("\n", end - 1);
      if (newline > start) {
        end = newline + 1;
      }
    }
    const raw = content.slice(start, end);
    const text = raw.trim();
    const leading = raw.length - raw.trimStart().length;
    const startLine = line + countNewlines(raw, 0, leading);
    if (text) {
      yield {
        content: text,
        startLine,
        endLine: startLine + countNewlines(text, 0, text.length),
      };
    }
    if (end === content.length) {
      break;
    }
    const next = Math.max(
      start + 1,
      end - Math.min(overlap, Math.floor((end - start) / 2)),
    );
    line += countNewlines(content, start, next);
    start = next;
  }
}

function countNewlines(content: string, start: number, end: number): number {
  let count = 0;
  for (let index = start; index < end; index += 1) {
    if (content[index] === "\n") {
      count += 1;
    }
  }
  return count;
}
