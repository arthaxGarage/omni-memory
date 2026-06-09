import { describe, it, expect } from "vitest";
import { chunk } from "../src/lib/chunk.js";

describe("chunk", () => {
  it("splits terminal text on blank lines and drops tiny fragments", () => {
    const out = chunk("first block of meaningful text here\n\nsecond block of meaningful text\n\ntiny", "terminal");
    expect(out).toEqual([
      "first block of meaningful text here",
      "second block of meaningful text",
    ]);
  });

  it("chunks code by size with overlap", () => {
    const text = "x".repeat(4000); // ~1000 tokens at 4 chars/token
    const out = chunk(text, "code");
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.length > 20)).toBe(true);
  });

  it("returns nothing for whitespace-only input", () => {
    expect(chunk("   \n\n   ", "chat")).toEqual([]);
  });

  it("keeps a single short chat note as one chunk", () => {
    const out = chunk("a concise but long-enough chat note to survive", "chat");
    expect(out).toHaveLength(1);
  });
});
