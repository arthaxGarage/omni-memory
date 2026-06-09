import type { SourceType } from "./types.js";

const CHARS_PER_TOKEN = 4;

function chunkBySize(text: string, targetTokens: number, overlapTokens: number): string[] {
  const target = targetTokens * CHARS_PER_TOKEN;
  const overlap = overlapTokens * CHARS_PER_TOKEN;
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + target).trim());
    start += target - overlap;
  }
  return chunks.filter((c) => c.length > 20);
}

export function chunk(text: string, sourceType: SourceType): string[] {
  if (sourceType === "terminal") {
    return text.split(/\n\n+/).map((s) => s.trim()).filter((s) => s.length > 20);
  }
  if (sourceType === "code") {
    return chunkBySize(text, 400, 50);
  }
  return chunkBySize(text, 512, 50);
}
