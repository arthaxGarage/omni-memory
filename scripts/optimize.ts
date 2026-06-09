import { config } from "dotenv";
import { optimizeMemories } from "../src/lib/maintenance";

config({ quiet: true });

// Optional: --days N to override the 7-day retention window for this run.
const daysFlag = process.argv.indexOf("--days");
const days = daysFlag !== -1 ? parseInt(process.argv[daysFlag + 1], 10) : 7;

if (Number.isNaN(days) || days < 0) {
  console.error("Usage: npx tsx scripts/optimize.ts [--days N]");
  process.exit(1);
}

console.log(`Optimizing memories (pruning versions older than ${days} day(s))...`);
const stats = await optimizeMemories(days);
console.log("Done. Stats:");
console.log(JSON.stringify(stats, null, 2));
