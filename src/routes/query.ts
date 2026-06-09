import { Router } from "express";
import { embed } from "../lib/embed.js";
import { getTable } from "../lib/db.js";
import { isSourceType, IMPORTANCE_WEIGHT, type SearchRow } from "../lib/types.js";
import { sqlString, tagFilter, andWhere, parseTags } from "../lib/sql.js";

export const queryRouter = Router();

queryRouter.get("/", async (req, res, next) => {
  try {
    const { q, top_k = "5", source, tags } = req.query as {
      q?: string;
      top_k?: string;
      source?: string;
      tags?: string;
    };

    if (!q) {
      res.status(400).json({ error: "q parameter is required" });
      return;
    }

    if (source !== undefined && !isSourceType(source)) {
      res.status(400).json({ error: "source must be terminal, chat, or code" });
      return;
    }

    const topK = Math.min(parseInt(top_k, 10) || 5, 20);
    const tagList = parseTags(tags);

    const table = await getTable();
    const vector = await embed(q);

    // Prefilter in the engine, then over-fetch so importance can re-rank.
    let search = table.vectorSearch(vector).distanceType("cosine").limit(Math.min(topK * 4, 50));
    const where = andWhere(
      source ? `source_type = ${sqlString(source)}` : undefined,
      tagList.length ? tagFilter(tagList) : undefined,
    );
    if (where) search = search.where(where);

    const raw = (await search.toArray()) as SearchRow[];

    const results = raw
      .map((r) => {
        const similarity = r._distance != null ? 1 - r._distance : 0;
        return {
          id: r.id,
          text: r.text,
          source_type: r.source_type,
          tags: r.tags,
          importance: r.importance,
          source_path: r.source_path ?? null,
          timestamp: r.timestamp,
          similarity: parseFloat(similarity.toFixed(4)),
          // Nudge by importance relative to the 0.5 neutral baseline.
          score: similarity + IMPORTANCE_WEIGHT * ((r.importance ?? 0.5) - 0.5),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ score, ...rest }) => rest);

    res.json(results);
  } catch (err) {
    next(err);
  }
});
