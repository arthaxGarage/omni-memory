import { readFileSync } from "fs";
import { config } from "dotenv";
import { chunk } from "../src/lib/chunk";
import { storeChunks } from "../src/lib/store";
import { isSourceType } from "../src/lib/types";

config({ quiet: true });

const [, , filePath, sourceTypeArg = "chat"] = process.argv;

if (!filePath) {
  console.error("Usage: npx tsx scripts/ingest.ts <file> [terminal|chat|code]");
  process.exit(1);
}

if (!isSourceType(sourceTypeArg)) {
  console.error(`Invalid source type "${sourceTypeArg}". Use terminal, chat, or code.`);
  process.exit(1);
}

const text = readFileSync(filePath, "utf-8");
const chunks = chunk(text, sourceTypeArg);

console.log(`Ingesting ${chunks.length} chunks from ${filePath}...`);

const { insertedIds, skipped } = await storeChunks(chunks, sourceTypeArg, {
  sourcePath: filePath,
  onProgress: (e) => process.stdout.write(e === "inserted" ? "." : "s"),
});

console.log(`\nDone. ${insertedIds.length} inserted, ${skipped} skipped (duplicates).`);
