import { Router } from "express";
import { chunk } from "../lib/chunk.js";
import { storeChunks } from "../lib/store.js";
import { isSourceType, SOURCE_TYPES } from "../lib/types.js";

export const rememberRouter = Router();

rememberRouter.post("/", async (req, res, next) => {
  try {
    const { text, source_type, tags, importance } = req.body as {
      text?: string;
      source_type?: string;
      tags?: string[];
      importance?: number;
    };

    if (!text || !source_type) {
      res.status(400).json({ error: "text and source_type are required" });
      return;
    }

    if (!isSourceType(source_type)) {
      res.status(400).json({ error: `source_type must be one of: ${SOURCE_TYPES.join(", ")}` });
      return;
    }

    if (importance !== undefined && (typeof importance !== "number" || importance < 0 || importance > 1)) {
      res.status(400).json({ error: "importance must be a number between 0 and 1" });
      return;
    }

    const chunks = chunk(text, source_type);
    const { insertedIds } = await storeChunks(chunks, source_type, {
      tags: Array.isArray(tags) ? tags : [],
      importance,
    });

    res.json({ status: "ok", inserted: insertedIds.length, ids: insertedIds });
  } catch (err) {
    next(err);
  }
});
