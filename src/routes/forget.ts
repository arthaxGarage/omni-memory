import { Router } from "express";
import { deleteMemory } from "../lib/db.js";

export const forgetRouter = Router();

// RFC 4122 UUID (any version) — the only id format /remember ever hands out.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

forgetRouter.delete("/", async (req, res, next) => {
  try {
    const { id } = req.body as { id?: string };

    if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
      res.status(400).json({ error: "a valid memory id (uuid) is required" });
      return;
    }

    deleteMemory(id);
    res.json({ status: "ok", id });
  } catch (err) {
    next(err);
  }
});
