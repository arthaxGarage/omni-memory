import { describe, it, expect } from "vitest";
import { isDuplicate } from "../src/lib/dedupe.js";

describe("isDuplicate", () => {
  it("flags near-identical (distance below 1 - threshold)", () => {
    expect(isDuplicate(0.02)).toBe(true); // similarity 0.98 >= 0.97
  });

  it("does not flag distant matches", () => {
    expect(isDuplicate(0.5)).toBe(false); // similarity 0.5
  });

  it("respects a custom threshold", () => {
    expect(isDuplicate(0.1, 0.85)).toBe(true); // similarity 0.9 >= 0.85
  });
});
