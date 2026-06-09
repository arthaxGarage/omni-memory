import { Router } from "express";
import { getTable } from "../lib/db.js";

export const forgetRouter = Router();

// RFC 4122 UUID (any version). Guards the LanceDB delete predicate against injection.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

forgetRouter.delete("/", async (req, res, next) => {
  try {
    const { id } = req.body as { id?: string };

    if (!id || typeof id !== "string" || !UUID_RE.test(id)) {
      res.status(400).json({ error: "a valid memory id (uuid) is required" });
      return;
    }

    const table = await getTable();
    await table.delete(`id = '${id}'`);
    res.json({ status: "ok", id });
  } catch (err) {
    next(err);
  }
});
