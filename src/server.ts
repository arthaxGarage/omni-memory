import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "dotenv";
import { authMiddleware } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { rememberRouter } from "./routes/remember.js";
import { queryRouter } from "./routes/query.js";
import { listRouter } from "./routes/list.js";
import { forgetRouter } from "./routes/forget.js";

config({ quiet: true });

const app = express();
const PORT = Number(process.env.PORT ?? 8000);

app.use(express.json());
app.use(authMiddleware);

app.use("/health", healthRouter);
app.use("/remember", rememberRouter);
app.use("/query", queryRouter);
app.use("/list", listRouter);
app.use("/forget", forgetRouter);

// Centralized JSON error handler — keeps route handlers free of try/catch noise.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[omni-memory] request failed:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal error", message: String(err instanceof Error ? err.message : err) });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`omni-memory hub listening on http://127.0.0.1:${PORT}`);
});
