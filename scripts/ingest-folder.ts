import { readFileSync, readdirSync } from "fs";
import { join, extname, basename } from "path";
import { config } from "dotenv";
import { chunk } from "../src/lib/chunk";
import { storeChunks } from "../src/lib/store";
import { isSourceType, type SourceType } from "../src/lib/types";

config({ quiet: true });

const SOURCE_TYPE_MAP: Record<string, SourceType> = {
  ".ts": "code", ".tsx": "code", ".js": "code", ".jsx": "code",
  ".py": "code", ".cs": "code", ".json": "code", ".yaml": "code", ".yml": "code",
  ".md": "chat", ".txt": "chat",
  ".log": "terminal",
};

function detectSourceType(filePath: string): SourceType {
  return SOURCE_TYPE_MAP[extname(filePath).toLowerCase()] ?? "chat";
}

function collectFiles(dir: string, recursive: boolean): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && recursive) {
      files.push(...collectFiles(full, recursive));
    } else if (e.isFile() && extname(e.name).toLowerCase() in SOURCE_TYPE_MAP) {
      files.push(full);
    }
  }
  return files;
}

const [, , folderPath, flagOrType] = process.argv;

if (!folderPath) {
  console.error("Usage: npx tsx scripts/ingest-folder.ts <folder> [--recursive] [terminal|chat|code]");
  process.exit(1);
}

const recursive = flagOrType === "--recursive";
const explicitType = !recursive && flagOrType ? flagOrType : undefined;

if (explicitType && !isSourceType(explicitType)) {
  console.error(`Invalid source type "${explicitType}". Use terminal, chat, or code.`);
  process.exit(1);
}

const files = collectFiles(folderPath, recursive);

if (files.length === 0) {
  console.log("No supported files found.");
  process.exit(0);
}

console.log(`Found ${files.length} file(s). Starting ingest...\n`);

let totalInserted = 0;
let totalSkipped = 0;

for (const filePath of files) {
  const sourceType = explicitType ? (explicitType as SourceType) : detectSourceType(filePath);
  const text = readFileSync(filePath, "utf-8");
  const chunks = chunk(text, sourceType);

  process.stdout.write(`${basename(filePath)} (${sourceType}, ${chunks.length} chunks): `);

  const { insertedIds, skipped } = await storeChunks(chunks, sourceType, {
    sourcePath: filePath,
    onProgress: (e) => process.stdout.write(e === "inserted" ? "." : "s"),
  });

  console.log(` ${insertedIds.length} inserted, ${skipped} skipped`);
  totalInserted += insertedIds.length;
  totalSkipped += skipped;
}

console.log(`\nTotal: ${totalInserted} inserted, ${totalSkipped} skipped (duplicates).`);
