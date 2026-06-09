import { Router } from "express";
import { getTable } from "../lib/db.js";
import { embed } from "../lib/embed.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const out: { status: string; count?: number; ollama: string; message?: string } = {
    status: "ok",
    ollama: "ok",
  };

  try {
    const table = await getTable();
    out.count = await table.countRows();
  } catch (err) {
    res.status(500).json({ status: "error", ollama: "unknown", message: String(err) });
    return;
  }

  // Confirm the embedding backend is reachable; degrade gracefully if not.
  try {
    await embed("healthcheck");
  } catch {
    out.status = "degraded";
    out.ollama = "unreachable";
  }

  res.status(out.status === "ok" ? 200 : 503).json(out);
});
