import { describe, it, expect } from "vitest";
import { sqlString, tagFilter, andWhere, parseTags } from "../src/lib/sql.js";

describe("sqlString", () => {
  it("wraps and escapes single quotes (injection guard)", () => {
    expect(sqlString("code")).toBe("'code'");
    expect(sqlString("' OR '1'='1")).toBe("''' OR ''1''=''1'");
  });
});

describe("tagFilter", () => {
  it("builds an array_has_any predicate from quoted tags", () => {
    expect(tagFilter(["a", "b"])).toBe("array_has_any(tags, ['a', 'b'])");
  });

  it("escapes quotes inside tags", () => {
    expect(tagFilter(["o'brien"])).toBe("array_has_any(tags, ['o''brien'])");
  });
});

describe("andWhere", () => {
  it("joins non-empty clauses with AND and parenthesizes", () => {
    expect(andWhere("a = 1", "b = 2")).toBe("(a = 1) AND (b = 2)");
  });

  it("drops falsy clauses", () => {
    expect(andWhere("a = 1", undefined, false, "")).toBe("(a = 1)");
  });

  it("returns undefined when nothing is left", () => {
    expect(andWhere(undefined, false)).toBeUndefined();
  });
});

describe("parseTags", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseTags(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("returns [] for undefined", () => {
    expect(parseTags(undefined)).toEqual([]);
  });
});
