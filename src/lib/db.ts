import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { EMBED_DIM, type MemoryRow, type SearchRow, type SourceType } from "./types.js";
import { buildFilters, type Filters } from "./sql.js";

config({ quiet: true });

// Home dir is USERPROFILE on Windows, HOME on Linux/macOS.
const HOME_DIR = process.env.USERPROFILE ?? process.env.HOME ?? ".";
const DB_PATH = process.env.DB_PATH ?? `${HOME_DIR}/.ai_memory`;
const DB_FILE = "memories.db";

let _db: Database.Database | null = null;

/** Serialize an embedding as the little-endian float32 blob sqlite-vec expects. */
export function vectorToBlob(vector: number[]): Buffer {
  if (vector.length !== EMBED_DIM) {
    throw new Error(`expected ${EMBED_DIM}-dim vector, got ${vector.length}`);
  }
  return Buffer.from(new Float32Array(vector).buffer);
}

/** Deserialize a stored float32 blob back into a JS array. */
export function blobToVector(blob: Buffer): number[] {
  return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
}

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(DB_PATH, { recursive: true });
  const db = new Database(join(DB_PATH, DB_FILE));
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      text        TEXT NOT NULL,
      vector      BLOB NOT NULL,
      timestamp   TEXT NOT NULL,
      source_type TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      importance  REAL NOT NULL DEFAULT 0.5,
      source_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories (timestamp);
  `);

  _db = db;
  return db;
}

/** Raw database row: tags as JSON text, vector as blob. */
interface DbRow {
  id: string;
  text: string;
  timestamp: string;
  source_type: SourceType;
  tags: string;
  importance: number;
  source_path: string | null;
  distance?: number;
}

function toMemory(row: DbRow): Omit<MemoryRow, "vector"> {
  return {
    id: row.id,
    text: row.text,
    timestamp: row.timestamp,
    source_type: row.source_type,
    tags: JSON.parse(row.tags) as string[],
    importance: row.importance,
    source_path: row.source_path,
  };
}

export function insertMemory(row: MemoryRow): void {
  getDb()
    .prepare(
      `INSERT INTO memories (id, text, vector, timestamp, source_type, tags, importance, source_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.text,
      vectorToBlob(row.vector),
      row.timestamp,
      row.source_type,
      JSON.stringify(row.tags),
      row.importance,
      row.source_path,
    );
}

/** Cosine distance (1 - similarity) to the closest stored memory, or null when empty. */
export function nearestDistance(vector: number[]): number | null {
  const row = getDb()
    .prepare(
      `SELECT vec_distance_cosine(vector, ?) AS distance
       FROM memories ORDER BY distance LIMIT 1`,
    )
    .get(vectorToBlob(vector)) as { distance: number } | undefined;
  return row?.distance ?? null;
}

/** Nearest-neighbour search with optional source/tag filters. */
export function searchMemories(
  vector: number[],
  opts: Filters & { limit: number },
): SearchRow[] {
  const { where, params } = buildFilters(opts);
  const rows = getDb()
    .prepare(
      `SELECT id, text, timestamp, source_type, tags, importance, source_path,
              vec_distance_cosine(vector, ?) AS distance
       FROM memories ${where}
       ORDER BY distance LIMIT ?`,
    )
    .all(vectorToBlob(vector), ...params, opts.limit) as DbRow[];
  return rows.map((r) => ({ ...toMemory(r), distance: r.distance ?? 1 }));
}

/** Newest-first page of memories plus the total count matching the filters. */
export function listMemories(
  opts: Filters & { limit: number; offset: number },
): { total: number; items: Omit<MemoryRow, "vector">[] } {
  const db = getDb();
  const { where, params } = buildFilters(opts);
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM memories ${where}`)
    .get(...params) as { total: number };
  const rows = db
    .prepare(
      `SELECT id, text, timestamp, source_type, tags, importance, source_path
       FROM memories ${where}
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.limit, opts.offset) as DbRow[];
  return { total, items: rows.map(toMemory) };
}

/** Every stored memory including its vector (for offline sweeps like dedupe-existing). */
export function allMemories(): MemoryRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM memories ORDER BY timestamp`)
    .all() as (DbRow & { vector: Buffer })[];
  return rows.map((r) => ({ ...toMemory(r), vector: blobToVector(r.vector) }));
}

/** Delete by id; returns whether a row was removed. */
export function deleteMemory(id: string): boolean {
  return getDb().prepare(`DELETE FROM memories WHERE id = ?`).run(id).changes > 0;
}

export function countMemories(): number {
  const { n } = getDb().prepare(`SELECT COUNT(*) AS n FROM memories`).get() as { n: number };
  return n;
}
