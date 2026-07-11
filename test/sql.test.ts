import { describe, it, expect } from "vitest";
import { buildFilters, parseTags } from "../src/lib/sql.js";

describe("buildFilters", () => {
  it("returns an empty clause when no filters are given", () => {
    expect(buildFilters({})).toEqual({ where: "", params: [] });
    expect(buildFilters({ tags: [] })).toEqual({ where: "", params: [] });
  });

  it("binds source as a parameter", () => {
    expect(buildFilters({ source: "code" })).toEqual({
      where: "WHERE (source_type = ?)",
      params: ["code"],
    });
  });

  it("builds a json_each any-of predicate with one placeholder per tag", () => {
    const { where, params } = buildFilters({ tags: ["a", "b"] });
    expect(where).toBe(
      "WHERE (EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE json_each.value IN (?, ?)))",
    );
    expect(params).toEqual(["a", "b"]);
  });

  it("never interpolates values into the SQL (injection guard)", () => {
    const hostile = "' OR '1'='1";
    const { where, params } = buildFilters({ tags: [hostile] });
    expect(where).not.toContain(hostile);
    expect(params).toEqual([hostile]);
  });

  it("ANDs source and tag filters together", () => {
    const { where, params } = buildFilters({ source: "chat", tags: ["x"] });
    expect(where).toBe(
      "WHERE (source_type = ?) AND (EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE json_each.value IN (?)))",
    );
    expect(params).toEqual(["chat", "x"]);
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
