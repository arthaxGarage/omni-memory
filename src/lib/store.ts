import { randomUUID } from "crypto";
import { embed } from "./embed.js";
import { insertMemory, nearestDistance } from "./db.js";
import { isDuplicate } from "./dedupe.js";
import type { SourceType } from "./types.js";

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
  const insertedIds: string[] = [];
  let skipped = 0;

  for (const c of chunks) {
    const vector = await embed(c);

    const distance = nearestDistance(vector);
    if (distance !== null && isDuplicate(distance)) {
      skipped++;
      opts.onProgress?.("skipped");
      continue;
    }

    const id = randomUUID();
    insertMemory({
      id,
      text: c,
      vector,
      timestamp: new Date().toISOString(),
      source_type: sourceType,
      tags: opts.tags ?? [],
      importance: opts.importance ?? 0.5,
      source_path: opts.sourcePath ?? null,
    });
    insertedIds.push(id);
    opts.onProgress?.("inserted");
  }

  return { insertedIds, skipped };
}
