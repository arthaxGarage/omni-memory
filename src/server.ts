import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "dotenv";
import { authMiddleware } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { rememberRouter } from "./routes/remember.js";
import { queryRouter } from "./routes/query.js";
import { listRouter } from "./routes/list.js";
import { forgetRouter } from "./routes/forget.js";
import { optimizeMemories } from "./lib/maintenance.js";

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

const DAY_MS = 24 * 60 * 60 * 1000;

// Periodically compact the table and prune versions older than 7 days.
// Failures are logged and swallowed — maintenance must never crash the hub.
function scheduleMaintenance(): void {
  const run = async () => {
    try {
      const stats = await optimizeMemories();
      console.log("[omni-memory] optimize complete:", JSON.stringify(stats));
    } catch (err) {
      console.error("[omni-memory] optimize failed:", err);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY_MS).unref();
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`omni-memory hub listening on http://127.0.0.1:${PORT}`);
  scheduleMaintenance();
});
