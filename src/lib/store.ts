import { randomUUID } from "crypto";
import { embed } from "./embed.js";
import { getTable } from "./db.js";
import { isDuplicate } from "./dedupe.js";
import type { SourceType, SearchRow } from "./types.js";

export interface StoreOptions {
  tags?: string[];
  importance?: number;
  /** Origin file path, recorded on each chunk when ingesting from disk. */
  sourcePath?: string;
  /** Called once per chunk after it is inserted or skipped as a duplicate. */
  onProgress?: (event: "inserted" | "skipped") => void;
}

export interface StoreResult {
  insertedIds: string[];
  skipped: number;
}

/**
 * Embed each chunk, skip near-duplicates, and persist the rest.
 * Shared by the /remember route and the CLI ingest scripts.
 */
export async function storeChunks(
  chunks: string[],
  sourceType: SourceType,
  opts: StoreOptions = {},
): Promise<StoreResult> {
  const table = await getTable();
  const insertedIds: string[] = [];
  let skipped = 0;

  for (const c of chunks) {
    const vector = await embed(c);

    try {
      const nearby = (await table
        .vectorSearch(vector)
        .distanceType("cosine")
        .limit(1)
        .toArray()) as SearchRow[];
      if (nearby.length > 0 && isDuplicate(nearby[0]._distance ?? 1)) {
        skipped++;
        opts.onProgress?.("skipped");
        continue;
      }
    } catch {
      // Empty table on first insert — nothing to dedup against.
    }

    const id = randomUUID();
    await table.add([
      {
        id,
        text: c,
        vector,
        timestamp: new Date().toISOString(),
        source_type: sourceType,
        tags: opts.tags ?? [],
        importance: opts.importance ?? 0.5,
        source_path: opts.sourcePath ?? null,
      },
    ]);
    insertedIds.push(id);
    opts.onProgress?.("inserted");
  }

  return { insertedIds, skipped };
}
