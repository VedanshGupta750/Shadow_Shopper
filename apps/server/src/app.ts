import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { requestId } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { asyncHandler } from "./middleware/asyncHandler.js";
import { streamPersonasHandler } from "./sse/handler.js";
import { getMetricsSnapshot } from "./metrics.js";
import { logger } from "./logger.js";

export function createApp() {
  const app = express();

  app.use(requestId);
  app.use(helmet());

  const isProduction = process.env["NODE_ENV"] === "production";
  const devOrigin = "http://localhost:5173";
  const allowedOrigins = isProduction
    ? [process.env["FRONTEND_ORIGIN"]].filter((o): o is string => Boolean(o))
    : [devOrigin];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json());

  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url, requestId: req.id }, "Incoming request");
    next();
  });

  let envLoaded = false;
  try {
    envLoaded = !!process.env["AZURE_ENDPOINT"];
  } catch {
    envLoaded = false;
  }

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/readyz", (_req, res) => {
    if (envLoaded) {
      res.json({ status: "ok", uptime: process.uptime(), envLoaded: true });
    } else {
      res.status(503).json({ status: "not ready", envLoaded: false });
    }
  });

  const streamLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests, slow down" } },
  });

  app.post("/api/stream-personas", streamLimiter, asyncHandler(streamPersonasHandler));

  // Admin-only metrics endpoint, gated by ADMIN_SECRET shared header.
  // When ADMIN_SECRET is unset, /metrics returns 503 to avoid accidental exposure.
  app.get("/metrics", (req, res) => {
    const secret = process.env["ADMIN_SECRET"];
    if (!secret) {
      res
        .status(503)
        .json({ error: { code: "METRICS_DISABLED", message: "ADMIN_SECRET not configured" } });
      return;
    }
    const provided = req.header("x-admin-secret");
    if (provided !== secret) {
      res
        .status(401)
        .json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing X-Admin-Secret header" } });
      return;
    }
    res.json(getMetricsSnapshot());
  });

  app.use(errorHandler);

  return app;
}
