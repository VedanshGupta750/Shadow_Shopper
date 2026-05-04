import pino from "pino";

function createLogger() {
  const isDev = process.env["NODE_ENV"] !== "production";
  return pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    }),
  });
}

export const logger = createLogger();
