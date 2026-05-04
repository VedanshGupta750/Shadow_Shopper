import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../logger.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function hashKey(key: string): string {
  return crypto.createHash("sha1").update(key).digest("hex");
}

function cacheFilePath(key: string): string {
  return path.join(CACHE_DIR, `${hashKey(key)}.json`);
}

/**
 * Read/write-through filesystem cache.
 * On hit: returns parsed JSON if the file's mtime is within the TTL window.
 * On miss: calls `producer`, writes the result to disk, and returns it.
 * Cache write errors are logged but never propagate — the producer's value is always returned.
 */
export async function cached<T>(key: string, ttlMs: number = DEFAULT_TTL_MS, producer: () => Promise<T>): Promise<T> {
  ensureCacheDir();
  const filePath = cacheFilePath(key);

  try {
    const stat = fs.statSync(filePath);
    const age = Date.now() - stat.mtimeMs;
    if (age < ttlMs) {
      const raw = fs.readFileSync(filePath, "utf-8");
      logger.debug({ key, age: Math.round(age / 1000) }, "cache hit");
      return JSON.parse(raw) as T;
    }
    logger.debug({ key, age: Math.round(age / 1000), ttlMs }, "cache expired");
  } catch {
    logger.debug({ key }, "cache miss");
  }

  const value = await producer();

  try {
    fs.writeFileSync(filePath, JSON.stringify(value), "utf-8");
    logger.debug({ key }, "cache write");
  } catch (writeErr) {
    logger.warn({ key, err: writeErr }, "cache write failed — returning producer value");
  }

  return value;
}

/** Remove all files in the cache directory. */
export function clearCache(): void {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(CACHE_DIR, file));
  }
  logger.info({ removed: files.length }, "cache cleared");
}

/** Return stats about the current cache contents. */
export function getCacheStats(): { count: number; totalBytes: number; oldestMs: number; newestMs: number } {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  let totalBytes = 0;
  let oldestMs = Infinity;
  let newestMs = 0;

  for (const file of files) {
    const stat = fs.statSync(path.join(CACHE_DIR, file));
    totalBytes += stat.size;
    if (stat.mtimeMs < oldestMs) oldestMs = stat.mtimeMs;
    if (stat.mtimeMs > newestMs) newestMs = stat.mtimeMs;
  }

  return {
    count: files.length,
    totalBytes,
    oldestMs: files.length > 0 ? oldestMs : 0,
    newestMs: files.length > 0 ? newestMs : 0,
  };
}
