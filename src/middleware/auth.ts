import type { Request, Response, NextFunction } from "express";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.OMNI_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
