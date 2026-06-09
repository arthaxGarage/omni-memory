import { describe, it, expect } from "vitest";
import { isSourceType } from "../src/lib/types.js";

describe("isSourceType", () => {
  it("accepts the three valid source types", () => {
    expect(isSourceType("code")).toBe(true);
    expect(isSourceType("chat")).toBe(true);
    expect(isSourceType("terminal")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSourceType("bogus")).toBe(false);
    expect(isSourceType("")).toBe(false);
    expect(isSourceType(undefined)).toBe(false);
    expect(isSourceType(42)).toBe(false);
  });
});
