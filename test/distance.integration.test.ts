import { describe, it, expect, afterAll } from "vitest";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import * as lancedb from "@lancedb/lancedb";
import { isDuplicate } from "../src/lib/dedupe.js";
import { EMBED_DIM } from "../src/lib/types.js";

/**
 * Regression guard for the cosine-vs-L2 distance bug.
 *
 * The dedup path (src/lib/store.ts) and search (src/routes/query.ts) rely on
 * `.distanceType("cosine")` so that `_distance` is cosine distance (1 - sim).
 * These vectors are unit-norm and chosen so the verdict DIVERGES by metric:
 *   cosine similarity = 0.98  ->  cosine distance 0.02  -> isDuplicate TRUE
 *   under default L2:  L2^2 = 2*(1-0.98) = 0.04          -> isDuplicate FALSE
 * So if anyone drops `.distanceType("cosine")`, this test flips red.
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

afterAll(async () => {
  await rm(dbPath, { recursive: true, force: true }).catch(() => {});
});

describe("cosine distance semantics (mirrors store.ts dedup search)", () => {
  it("treats a cosine-0.98 neighbour as a duplicate (would fail under L2)", async () => {
    const db = await lancedb.connect(dbPath);
    const table = await db.createTable("t", [
      { id: "near", vector: near },
      { id: "far", vector: far },
    ]);

    const [hit] = await table
      .vectorSearch(base)
      .distanceType("cosine")
      .limit(1)
      .toArray();

    expect(hit.id).toBe("near");
    expect(hit._distance).toBeCloseTo(0.02, 2);   // cosine distance, not L2
    expect(isDuplicate(hit._distance)).toBe(true); // false if metric regresses to L2
  });
});
