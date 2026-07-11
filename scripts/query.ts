import { config } from "dotenv";
import { embed } from "../src/lib/embed";
import { searchMemories } from "../src/lib/db";

config({ quiet: true });

const query = process.argv.slice(2).join(" ");

if (!query) {
  console.error("Usage: npx tsx scripts/query.ts <your question>");
  process.exit(1);
}

const vector = await embed(query);
const results = searchMemories(vector, { limit: 6 });

if (results.length === 0) {
  console.log("No memories found.");
  process.exit(0);
}

console.log(`\nTop results for: "${query}"\n${"─".repeat(60)}`);
results.forEach((r, i) => {
  const similarity = (1 - r.distance).toFixed(3);
  console.log(`[${i + 1}] type:${r.source_type}  similarity:${similarity}  ${r.timestamp}`);
  console.log(`    ${r.text.slice(0, 250).replace(/\n/g, " ")}`);
  console.log();
});
