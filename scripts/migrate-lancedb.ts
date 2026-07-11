import { config } from "dotenv";
import { getDb, insertMemory, countMemories } from "../src/lib/db";
import { EMBED_DIM, isSourceType, type MemoryRow } from "../src/lib/types";

config({ quiet: true });

// One-off migration: copy every row out of a legacy LanceDB `memories` table
// into the current SQLite database (the DB_PATH from .env). Vectors are copied
// as-is - nothing is re-embedded. Ids are preserved, so re-running is
// idempotent: rows whose id already exists in SQLite are skipped.
//
// LanceDB is no longer a project dependency; install it just for this run:
//
//   npm install --no-save @lancedb/lancedb
//   npx tsx scripts/migrate-lancedb.ts <path-to-old-lancedb-dir>            # dry run
//   npx tsx scripts/migrate-lancedb.ts <path-to-old-lancedb-dir> --apply    # migrate
//
// <path-to-old-lancedb-dir> is the old DB_PATH (the folder containing
// `memories.lance/`), e.g. C:/Users/<you>/.ai_memory on Windows. The old table
// and the new memories.db can share that folder - they never touch each other.

const TABLE_NAME = "memories";

const [, , sourcePath, ...rest] = process.argv;
const APPLY = rest.includes("--apply");

if (!sourcePath || sourcePath.startsWith("--")) {
  console.error("Usage: npx tsx scripts/migrate-lancedb.ts <path-to-old-lancedb-dir> [--apply]");
  process.exit(1);
}

let lancedb: any;
try {
  lancedb = await import("@lancedb/lancedb");
} catch {
  console.error(
    "@lancedb/lancedb is not installed (it is no longer a project dependency).\n" +
      "Install it temporarily for this migration:\n\n" +
      "  npm install --no-save @lancedb/lancedb\n",
  );
  process.exit(1);
}

const conn = await lancedb.connect(sourcePath);
const names: string[] = await conn.tableNames();
if (!names.includes(TABLE_NAME)) {
  console.error(`No '${TABLE_NAME}' table found in ${sourcePath} (tables: ${names.join(", ") || "none"})`);
  process.exit(1);
}

const table = await conn.openTable(TABLE_NAME);
const raw: any[] = await table.query().toArray();
console.log(`Read ${raw.length} row(s) from ${sourcePath}/${TABLE_NAME}.lance`);

// Ids already present in SQLite (from a previous run or fresh saves).
const db = getDb();
const existing = new Set<string>(
  (db.prepare("SELECT id FROM memories").all() as { id: string }[]).map((r) => r.id),
);

let migrated = 0;
let skippedExisting = 0;
let skippedInvalid = 0;

for (const r of raw) {
  if (typeof r.id !== "string" || existing.has(r.id)) {
    skippedExisting++;
    continue;
  }

  // Arrow hands back vectors/lists as Arrow objects - materialize to JS arrays.
  const vector = r.vector ? Array.from(r.vector as Iterable<number>) : [];
  if (vector.length !== EMBED_DIM || typeof r.text !== "string" || r.text.length === 0) {
    console.warn(`  skipping invalid row ${r.id} (vector ${vector.length}-dim, text ${typeof r.text})`);
    skippedInvalid++;
    continue;
  }

  const row: MemoryRow = {
    id: r.id,
    text: r.text,
    vector,
    timestamp: typeof r.timestamp === "string" ? r.timestamp : new Date(0).toISOString(),
    source_type: isSourceType(r.source_type) ? r.source_type : "chat",
    tags: r.tags ? Array.from(r.tags as Iterable<string>).filter((t) => typeof t === "string") : [],
    importance: typeof r.importance === "number" && r.importance >= 0 && r.importance <= 1 ? r.importance : 0.5,
    source_path: typeof r.source_path === "string" ? r.source_path : null,
  };

  if (APPLY) insertMemory(row);
  migrated++;
}

const verb = APPLY ? "migrated" : "would migrate";
console.log(
  `\n${verb}: ${migrated}  |  already present: ${skippedExisting}  |  invalid: ${skippedInvalid}`,
);
if (!APPLY) {
  console.log("Dry run - nothing written. Re-run with --apply to migrate.");
} else {
  console.log(`SQLite now holds ${countMemories()} memories.`);
  console.log("Once verified (npx tsx scripts/query.ts <something you remember>), the old");
  console.log(`'${TABLE_NAME}.lance' folder can be archived or deleted.`);
}
