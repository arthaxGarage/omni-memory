import { config } from "dotenv";
import { getTable } from "../src/lib/db";
import type { MemoryRow } from "../src/lib/types";

config({ quiet: true });

// One-off sweep: collapse near-duplicate rows already in the table (chunks
// stored before dedup used cosine distance). Keeps the OLDEST row in each
// cluster — mirroring the "existing wins, new is skipped" insert behaviour.
//
//   npx tsx scripts/dedupe-existing.ts            # dry run (default)
//   npx tsx scripts/dedupe-existing.ts --apply    # actually delete
//   npx tsx scripts/dedupe-existing.ts --apply --threshold 0.95

const THRESHOLD = (() => {
  const i = process.argv.indexOf("--threshold");
  const v = i !== -1 ? parseFloat(process.argv[i + 1]) : 0.97;
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.97;
})();
const APPLY = process.argv.includes("--apply");

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

const table = await getTable();
const raw = (await table.query().toArray()) as MemoryRow[];
// `.toArray()` hands back each vector as an Arrow Vector, not a JS array —
// materialize to number[] so the cosine loop can index it.
const rows = raw.map((r) => ({ ...r, vector: Array.from(r.vector as Iterable<number>) }));
rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp)); // oldest first = kept

console.log(`Scanning ${rows.length} rows for duplicates (cosine >= ${THRESHOLD})...`);

const deleted = new Set<string>();
const clusters: { keep: MemoryRow; drop: MemoryRow[] }[] = [];

for (let i = 0; i < rows.length; i++) {
  if (deleted.has(rows[i].id)) continue;
  const drop: MemoryRow[] = [];
  for (let j = i + 1; j < rows.length; j++) {
    if (deleted.has(rows[j].id)) continue;
    if (cosine(rows[i].vector, rows[j].vector) >= THRESHOLD) {
      deleted.add(rows[j].id);
      drop.push(rows[j]);
    }
  }
  if (drop.length) clusters.push({ keep: rows[i], drop });
}

const preview = (t: string) => t.slice(0, 70).replace(/\n/g, " ");

if (clusters.length === 0) {
  console.log("No duplicates found. Nothing to do.");
  process.exit(0);
}

console.log(`\nFound ${clusters.length} cluster(s), ${deleted.size} row(s) to remove:\n`);
for (const { keep, drop } of clusters) {
  console.log(`KEEP  ${keep.id}  "${preview(keep.text)}"`);
  for (const d of drop) console.log(`  drop ${d.id}  "${preview(d.text)}"`);
}

if (!APPLY) {
  console.log(`\nDry run — nothing deleted. Re-run with --apply to remove ${deleted.size} row(s).`);
  process.exit(0);
}

console.log(`\nDeleting ${deleted.size} row(s)...`);
const ids = [...deleted].map((id) => `'${id}'`).join(", ");
await table.delete(`id IN (${ids})`);
console.log(`Done. ${rows.length - deleted.size} row(s) remain.`);
