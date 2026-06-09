import type { OptimizeStats } from "@lancedb/lancedb";
import { getTable } from "./db.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The cutoff date `days` before `now` (pure — used for retention + testing). */
export function cutoffDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Compact the memories table and prune versions older than `retentionDays`.
 *
 * `deleteUnverified` is left false (the LanceDB default): files younger than
 * 7 days are never reclaimed, which keeps the operation safe even when an ingest
 * script holds an in-progress transaction. The current version is never removed.
 */
export async function optimizeMemories(retentionDays = 7): Promise<OptimizeStats> {
  const table = await getTable();
  return table.optimize({
    cleanupOlderThan: cutoffDate(new Date(), retentionDays),
    deleteUnverified: false,
  });
}
