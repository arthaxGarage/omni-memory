import { Ollama } from "ollama";
import { config } from "dotenv";

config({ quiet: true });

export const EMBED_MODEL = "nomic-embed-text";

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? "http://localhost:11434" });

export async function embed(text: string): Promise<number[]> {
  const res = await ollama.embed({ model: EMBED_MODEL, input: text });
  const vector = res.embeddings?.[0];
  if (!vector || vector.length === 0) {
    throw new Error(`Ollama returned no embedding for input (model: ${EMBED_MODEL})`);
  }
  return vector;
}
