/**
 * Parameterized filter builder for the memories table. User-supplied values
 * are always bound as SQL parameters, never interpolated into the statement.
 */

import type { SourceType } from "./types.js";

export interface Filters {
  source?: SourceType;
  tags?: string[];
}

/**
 * Build a WHERE clause (possibly empty) and its bound parameters from the
 * optional source/tag filters. Tag matching is "any of": a row qualifies when
 * its JSON tags array contains at least one of the given tags.
 */
export function buildFilters(f: Filters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (f.source) {
    clauses.push("source_type = ?");
    params.push(f.source);
  }
  if (f.tags && f.tags.length > 0) {
    const placeholders = f.tags.map(() => "?").join(", ");
    clauses.push(
      `EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE json_each.value IN (${placeholders}))`,
    );
    params.push(...f.tags);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.map((c) => `(${c})`).join(" AND ")}` : "",
    params,
  };
}

/** Parse a comma-separated tag string into trimmed, non-empty tags. */
export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
