import "server-only";

/** Character-based chunks with overlap; prefers paragraph boundaries. */
export function chunkTextForEmbedding(
  text: string,
  chunkSize = 1800,
  overlap = 200
): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (t.length <= chunkSize) return [t];

  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + chunkSize, t.length);
    if (end < t.length) {
      const slice = t.slice(start, end);
      const lastPara = slice.lastIndexOf("\n\n");
      const lastSentence = slice.lastIndexOf(". ");
      const breakAt = Math.max(
        lastPara > chunkSize * 0.35 ? lastPara : -1,
        lastSentence > chunkSize * 0.45 ? lastSentence + 1 : -1
      );
      if (breakAt > chunkSize * 0.35) {
        end = start + breakAt + (slice[breakAt] === "." ? 1 : 0);
      }
    }
    const piece = t.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);
    if (end >= t.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
