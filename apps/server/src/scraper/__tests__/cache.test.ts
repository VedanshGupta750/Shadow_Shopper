import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cached, clearCache, getCacheStats } from "../cache.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");

function hashKey(key: string): string {
  return crypto.createHash("sha1").update(key).digest("hex");
}

beforeEach(() => {
  if (fs.existsSync(CACHE_DIR)) {
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));
  }
});

afterEach(() => {
  if (fs.existsSync(CACHE_DIR)) {
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));
  }
});

describe("cached", () => {
  it("calls producer on cache miss and writes the result", async () => {
    // Arrange
    let called = 0;
    const producer = async () => {
      called++;
      return { value: 42 };
    };

    // Act
    const result = await cached("test-key", 60_000, producer);

    // Assert
    expect(result).toEqual({ value: 42 });
    expect(called).toBe(1);
    const filePath = path.join(CACHE_DIR, `${hashKey("test-key")}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("returns cached value on cache hit without calling producer again", async () => {
    // Arrange
    let called = 0;
    const producer = async () => {
      called++;
      return { value: called };
    };

    // Act
    await cached("hit-key", 60_000, producer);
    const second = await cached("hit-key", 60_000, producer);

    // Assert
    expect(second).toEqual({ value: 1 });
    expect(called).toBe(1);
  });

  it("re-calls producer when cache entry has expired", async () => {
    // Arrange
    let called = 0;
    const producer = async () => {
      called++;
      return { value: called };
    };

    await cached("expire-key", 1, producer);

    // Act — wait a tiny bit so mtime ages past the 1ms TTL
    await new Promise((r) => setTimeout(r, 20));
    const result = await cached("expire-key", 1, producer);

    // Assert
    expect(result).toEqual({ value: 2 });
    expect(called).toBe(2);
  });

  it("uses different files for different keys (no hash collision)", async () => {
    // Arrange & Act
    await cached("key-alpha", 60_000, async () => "alpha");
    await cached("key-beta", 60_000, async () => "beta");

    // Assert
    const alphaPath = path.join(CACHE_DIR, `${hashKey("key-alpha")}.json`);
    const betaPath = path.join(CACHE_DIR, `${hashKey("key-beta")}.json`);
    expect(fs.existsSync(alphaPath)).toBe(true);
    expect(fs.existsSync(betaPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(alphaPath, "utf-8"))).toBe("alpha");
    expect(JSON.parse(fs.readFileSync(betaPath, "utf-8"))).toBe("beta");
  });
});

describe("clearCache", () => {
  it("removes all cached files", async () => {
    // Arrange
    await cached("a", 60_000, async () => 1);
    await cached("b", 60_000, async () => 2);

    // Act
    clearCache();

    // Assert
    const stats = getCacheStats();
    expect(stats.count).toBe(0);
  });
});

describe("getCacheStats", () => {
  it("reports correct count and non-zero bytes", async () => {
    // Arrange
    await cached("stat-1", 60_000, async () => ({ big: "data".repeat(100) }));
    await cached("stat-2", 60_000, async () => [1, 2, 3]);

    // Act
    const stats = getCacheStats();

    // Assert
    expect(stats.count).toBe(2);
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.newestMs).toBeGreaterThanOrEqual(stats.oldestMs);
  });
});
