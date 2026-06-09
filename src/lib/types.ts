export type SourceType = "terminal" | "chat" | "code";

export const SOURCE_TYPES: readonly SourceType[] = ["terminal", "chat", "code"];

/** Embedding dimensionality produced by nomic-embed-text. */
export const EMBED_DIM = 768;

/** How strongly importance nudges ranking vs. raw similarity (0 = ignore). */
export const IMPORTANCE_WEIGHT = 0.1;

/** A stored memory record. */
export interface MemoryRow {
  id: string;
  text: string;
  vector: number[];
  timestamp: string;
  source_type: SourceType;
  tags: string[];
  importance: number;
  /** Origin file path when ingested from disk; null for ad-hoc saves. */
  source_path: string | null;
}

/** A row returned from a LanceDB vector search (adds `_distance`). */
export type SearchRow = MemoryRow & { _distance?: number };

export function isSourceType(v: unknown): v is SourceType {
  return typeof v === "string" && (SOURCE_TYPES as readonly string[]).includes(v);
}
