import { env } from "./env.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";

const SHUTDOWN_TIMEOUT_MS = 30_000;

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received, draining connections");

  // Stop accepting new connections; wait for in-flight requests to finish.
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server.close");
      process.exit(1);
    }
    logger.info("Server closed cleanly, exiting");
    process.exit(0);
  });

  // Hard cap: if anything is still hanging after SHUTDOWN_TIMEOUT_MS, force exit.
  // .unref() so this timer alone doesn't keep the process alive past server.close().
  setTimeout(() => {
    logger.error(
      { timeoutMs: SHUTDOWN_TIMEOUT_MS },
      "Forced shutdown after timeout",
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
