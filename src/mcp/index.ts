import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "dotenv";

config({ quiet: true });

const HUB = process.env.OMNI_HUB_URL ?? "http://127.0.0.1:8000";
const KEY = process.env.OMNI_API_KEY ?? "";

const headers = { "X-API-Key": KEY, "Content-Type": "application/json" };

const server = new McpServer({ name: "omni-memory", version: "1.0.0" });

server.tool(
  "search_memory",
  "Search your personal memory for relevant context — code snippets, terminal history, chat notes, or anything previously saved.",
  {
    query: z.string().describe("What to search for"),
    top_k: z.number().optional().describe("Number of results (default 5, max 20)"),
    source: z.enum(["terminal", "chat", "code"]).optional().describe("Filter by source type"),
    tags: z.array(z.string()).optional().describe("Only return memories matching any of these tags"),
  },
  async ({ query, top_k = 5, source, tags }) => {
    const params = new URLSearchParams({ q: query, top_k: String(top_k) });
    if (source) params.set("source", source);
    if (tags && tags.length) params.set("tags", tags.join(","));

    const res = await fetch(`${HUB}/query?${params}`, { headers });
    if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);

    const results = await res.json() as any[];
    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: "No memories found." }] };
    }

    const text = results
      .map((r, i) => {
        const origin = r.source_path ? `  src:${r.source_path}` : "";
        return `[${i + 1}] id:${r.id}  type:${r.source_type}  similarity:${r.similarity}${origin}\n${r.text}`;
      })
      .join("\n\n---\n\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "save_memory",
  "Save something to personal memory — a decision, code pattern, terminal output, or chat note.",
  {
    text: z.string().describe("The content to save"),
    source_type: z.enum(["terminal", "chat", "code"]).describe("Type of content"),
    tags: z.array(z.string()).optional().describe("Optional tags for filtering later"),
    importance: z.number().min(0).max(1).optional().describe("0-1 weight; higher ranks earlier in search (default 0.5)"),
  },
  async ({ text, source_type, tags, importance }) => {
    const res = await fetch(`${HUB}/remember`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, source_type, tags, importance }),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status} ${await res.text()}`);

    const result = await res.json() as any;
    return { content: [{ type: "text" as const, text: `Saved ${result.inserted} chunk(s) to memory.` }] };
  }
);

server.tool(
  "forget_memory",
  "Delete a memory entry by its ID. Use search_memory first to find the ID of the entry to delete.",
  {
    id: z.string().describe("The ID of the memory entry to delete"),
  },
  async ({ id }) => {
    const res = await fetch(`${HUB}/forget`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.status} ${await res.text()}`);

    return { content: [{ type: "text" as const, text: `Memory ${id} deleted.` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
