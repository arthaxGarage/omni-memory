import { Router } from "express";
import { listMemories } from "../lib/db.js";
import { isSourceType } from "../lib/types.js";
import { parseTags } from "../lib/sql.js";

export const listRouter = Router();

listRouter.get("/", async (req, res, next) => {
  try {
    const { limit = "20", offset = "0", source, tags } = req.query as {
      limit?: string;
      offset?: string;
      source?: string;
      tags?: string;
    };

    if (source !== undefined && !isSourceType(source)) {
      res.status(400).json({ error: "source must be terminal, chat, or code" });
      return;
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const { total, items } = listMemories({
      limit: lim,
      offset: off,
      source: source && isSourceType(source) ? source : undefined,
      tags: parseTags(tags),
    });

    res.json({ total, limit: lim, offset: off, items });
  } catch (err) {
    next(err);
  }
});
