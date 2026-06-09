import { config } from "dotenv";
import { embed } from "../src/lib/embed";
import { getTable } from "../src/lib/db";
import type { SearchRow } from "../src/lib/types";

config({ quiet: true });

const query = process.argv.slice(2).join(" ");

if (!query) {
  console.error("Usage: npx tsx scripts/query.ts <your question>");
  process.exit(1);
}

const table = await getTable();
const vector = await embed(query);

const results = (await table.vectorSearch(vector).distanceType("cosine").limit(6).toArray()) as SearchRow[];

if (results.length === 0) {
  console.log("No memories found.");
  process.exit(0);
}

console.log(`\nTop results for: "${query}"\n${"─".repeat(60)}`);
results.forEach((r, i) => {
  const similarity = r._distance != null ? (1 - r._distance).toFixed(3) : "n/a";
  console.log(`[${i + 1}] type:${r.source_type}  similarity:${similarity}  ${r.timestamp}`);
  console.log(`    ${r.text.slice(0, 250).replace(/\n/g, " ")}`);
  console.log();
});
