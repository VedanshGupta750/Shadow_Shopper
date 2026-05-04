import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  AZURE_ENDPOINT: z.string().url(),
  AZURE_API_KEY: z.string().min(1),
  AZURE_API_VERSION: z.string().default("2024-12-01-preview"),
  DEPLOYMENT_NAME: z.string().min(1),
  SCRAPERAPI_KEY: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url(),
  ADMIN_SECRET: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    throw new Error(`Invalid environment variables:\n${JSON.stringify(formatted, null, 2)}`);
  }
  return result.data;
}

export const env = loadEnv();
