import { Router } from "express";
import { getTable } from "../lib/db.js";
import { isSourceType, type MemoryRow } from "../lib/types.js";
import { sqlString, tagFilter, andWhere, parseTags } from "../lib/sql.js";

export const listRouter = Router();

// Columns to return — everything except the bulky embedding vector.
const COLUMNS = ["id", "text", "source_type", "tags", "importance", "source_path", "timestamp"];

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
    const tagList = parseTags(tags);

    const table = await getTable();

    let query = table.query().select(COLUMNS);
    const where = andWhere(
      source ? `source_type = ${sqlString(source)}` : undefined,
      tagList.length ? tagFilter(tagList) : undefined,
    );
    if (where) query = query.where(where);

    // No server-side timestamp ordering, so sort newest-first in JS then page.
    const all = (await query.toArray()) as Omit<MemoryRow, "vector">[];
    all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    res.json({
      total: all.length,
      limit: lim,
      offset: off,
      items: all.slice(off, off + lim),
    });
  } catch (err) {
    next(err);
  }
});
