import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { isDuplicate } from "../src/lib/dedupe.js";
import { EMBED_DIM, type MemoryRow, type SourceType } from "../src/lib/types.js";

/**
 * Regression guard for cosine distance semantics, against a real SQLite db.
 *
 * The dedup path (store.ts -> nearestDistance) and search (searchMemories)
 * rely on vec_distance_cosine, so `distance` is cosine distance (1 - sim).
 * These vectors are unit-norm and chosen so the verdict DIVERGES by metric:
 *   cosine similarity = 0.98  ->  cosine distance 0.02  -> isDuplicate TRUE
 *   under L2:          L2^2 = 2*(1-0.98) = 0.04          -> isDuplicate FALSE
 * So if the metric ever changes, this test flips red.
 */

// Unit vector with the given non-zero components; remaining dims are 0.
function makeVec(components: Record<number, number>): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  for (const [i, val] of Object.entries(components)) v[Number(i)] = val;
  return v;
}

const base = makeVec({ 0: 1 });                 // query vector
const near = makeVec({ 0: 0.98, 1: 0.199 });    // cosine 0.98 to base (||.|| = 1)
const far = makeVec({ [EMBED_DIM - 1]: 1 });    // cosine 0 to base

const dbPath = join(tmpdir(), `omni-dist-test-${randomUUID()}`);
process.env.DB_PATH = dbPath; // must be set before db.ts is imported

type Db = typeof import("../src/lib/db.js");
let db: Db;

function row(id: string, vector: number[], extra: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id,
    text: `memory ${id}`,
    vector,
    timestamp: new Date().toISOString(),
    source_type: "chat" as SourceType,
    tags: [],
    importance: 0.5,
    source_path: null,
    ...extra,
  };
}

beforeAll(async () => {
  db = await import("../src/lib/db.js");
  db.insertMemory(row("near", near, { tags: ["alpha"] }));
  db.insertMemory(row("far", far, { source_type: "code", tags: ["beta"] }));
});

afterAll(async () => {
  await rm(dbPath, { recursive: true, force: true }).catch(() => {});
});

describe("cosine distance semantics (mirrors store.ts dedup path)", () => {
  it("treats a cosine-0.98 neighbour as a duplicate (would fail under L2)", () => {
    const distance = db.nearestDistance(base);
    expect(distance).not.toBeNull();
    expect(distance!).toBeCloseTo(0.02, 2);      // cosine distance, not L2
    expect(isDuplicate(distance!)).toBe(true);   // false if metric regresses to L2
  });

  it("orders search results by cosine distance", () => {
    const results = db.searchMemories(base, { limit: 2 });
    expect(results.map((r) => r.id)).toEqual(["near", "far"]);
    expect(results[0].distance).toBeCloseTo(0.02, 2);
    expect(results[1].distance).toBeCloseTo(1, 2);
  });

  it("applies source and tag filters in the engine", () => {
    expect(db.searchMemories(base, { limit: 5, source: "code" }).map((r) => r.id)).toEqual(["far"]);
    expect(db.searchMemories(base, { limit: 5, tags: ["alpha"] }).map((r) => r.id)).toEqual(["near"]);
    expect(db.searchMemories(base, { limit: 5, tags: ["nope"] })).toEqual([]);
  });

  it("lists newest-first with paging and total", () => {
    const { total, items } = db.listMemories({ limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(items).toHaveLength(2);
    expect(items[0]).not.toHaveProperty("vector");
  });

  it("deletes by id", () => {
    db.insertMemory(row("gone", makeVec({ 5: 1 })));
    expect(db.deleteMemory("gone")).toBe(true);
    expect(db.deleteMemory("gone")).toBe(false);
    expect(db.countMemories()).toBe(2);
  });
});
