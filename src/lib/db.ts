import * as lancedb from "@lancedb/lancedb";
import { Schema, Field, Utf8, Float32, Float64, FixedSizeList, List } from "apache-arrow";
import { config } from "dotenv";
import { EMBED_DIM } from "./types.js";

config({ quiet: true });

// Home dir is USERPROFILE on Windows, HOME on Linux/macOS.
const HOME_DIR = process.env.USERPROFILE ?? process.env.HOME ?? ".";
const DB_PATH = process.env.DB_PATH ?? `${HOME_DIR}/.ai_memory`;
const TABLE_NAME = "memories";

let _table: lancedb.Table | null = null;

/** Explicit Arrow schema — no seed record needed to infer it. */
function memorySchema(): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field("text", new Utf8(), false),
    new Field(
      "vector",
      new FixedSizeList(EMBED_DIM, new Field("item", new Float32(), true)),
      false,
    ),
    new Field("timestamp", new Utf8(), false),
    new Field("source_type", new Utf8(), false),
    new Field("tags", new List(new Field("item", new Utf8(), true)), false),
    new Field("importance", new Float64(), false),
    new Field("source_path", new Utf8(), true),
  ]);
}

export async function getTable(): Promise<lancedb.Table> {
  if (_table) return _table;

  const db = await lancedb.connect(DB_PATH);
  const names = await db.tableNames();

  if (names.includes(TABLE_NAME)) {
    _table = await db.openTable(TABLE_NAME);
    // One-time cleanup: drop the legacy seed record if present.
    await _table.delete("id = 'seed'").catch(() => {});
    await migrate(_table);
  } else {
    _table = await db.createEmptyTable(TABLE_NAME, memorySchema());
  }

  return _table;
}

/** Add columns introduced after the original schema to pre-existing tables. */
async function migrate(table: lancedb.Table): Promise<void> {
  const fields = (await table.schema()).fields.map((f) => f.name);
  if (!fields.includes("source_path")) {
    await table
      .addColumns([{ name: "source_path", valueSql: "CAST(NULL AS STRING)" }])
      .catch(() => {});
  }
}
