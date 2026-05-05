import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id ?? "unknown";
  const isProduction = process.env["NODE_ENV"] === "production";

  if (err instanceof AppError) {
    logger.error({ err, requestId }, err.message);
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    });
    return;
  }

  // express.json() throws SyntaxError when the request body is malformed JSON.
  // Treat as a 400 client error rather than a 500 unhandled crash.
  const bodyParseFailed =
    err instanceof SyntaxError &&
    "status" in err &&
    (err as Error & { status?: number }).status === 400;
  if (bodyParseFailed) {
    logger.warn({ requestId, err: err.message }, "Body parse failed");
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body is not valid JSON",
        requestId,
      },
    });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isProduction ? "Internal server error" : err.message,
      requestId,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}
