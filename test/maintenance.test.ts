import { describe, it, expect } from "vitest";
import { cutoffDate } from "../src/lib/maintenance.js";

describe("cutoffDate", () => {
  it("subtracts whole days", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    expect(cutoffDate(now, 7).toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("preserves time-of-day", () => {
    const now = new Date("2026-06-09T13:45:30.000Z");
    expect(cutoffDate(now, 1).toISOString()).toBe("2026-06-08T13:45:30.000Z");
  });

  it("with 0 days returns the same instant", () => {
    const now = new Date("2026-06-09T13:45:30.000Z");
    expect(cutoffDate(now, 0).getTime()).toBe(now.getTime());
  });
});
