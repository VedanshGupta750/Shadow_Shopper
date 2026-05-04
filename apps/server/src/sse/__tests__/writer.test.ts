import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Response } from "express";
import { SseWriter } from "../writer.js";

function makeMockResponse() {
  const writes: string[] = [];
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    flushHeaders: vi.fn(),
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
  } as unknown as Response;
  return { res, writes, headers };
}

describe("SseWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets SSE headers and flushes on construction", () => {
    const { res, headers } = makeMockResponse();
    const writer = new SseWriter(res);

    expect(headers["Content-Type"]).toBe("text/event-stream; charset=utf-8");
    expect(headers["Cache-Control"]).toBe("no-cache, no-transform");
    expect(headers["Connection"]).toBe("keep-alive");
    expect(headers["X-Accel-Buffering"]).toBe("no");
    expect((res as unknown as { flushHeaders: ReturnType<typeof vi.fn> }).flushHeaders).toHaveBeenCalled();

    writer.close();
  });

  it("send() writes a properly formatted SSE frame", () => {
    const { res, writes } = makeMockResponse();
    const writer = new SseWriter(res);

    writer.send("phase", { phase: "scraping" });

    expect(writes.length).toBe(1);
    expect(writes[0]).toBe('event: phase\ndata: {"phase":"scraping"}\n\n');

    writer.close();
  });

  it("splits multi-line JSON across multiple data: lines", () => {
    const { res, writes } = makeMockResponse();
    const writer = new SseWriter(res);

    const longText = "line one\nline two\nline three";
    writer.send("persona-token", { personaId: "test", token: longText });

    expect(writes[0]).toContain("event: persona-token\n");
    expect(writes[0]?.endsWith("\n\n")).toBe(true);
    expect(writes[0]).toMatch(/data: /);

    writer.close();
  });

  it("heartbeat() writes a comment frame", () => {
    const { res, writes } = makeMockResponse();
    const writer = new SseWriter(res);

    writer.heartbeat();

    expect(writes).toContain(": ping\n\n");

    writer.close();
  });

  it("auto-heartbeats every 15 seconds", () => {
    const { res, writes } = makeMockResponse();
    const writer = new SseWriter(res);

    expect(writes.length).toBe(0);

    vi.advanceTimersByTime(15_000);
    expect(writes.filter((w) => w === ": ping\n\n").length).toBe(1);

    vi.advanceTimersByTime(15_000);
    expect(writes.filter((w) => w === ": ping\n\n").length).toBe(2);

    writer.close();
  });

  it("close() stops the heartbeat timer", () => {
    const { res, writes } = makeMockResponse();
    const writer = new SseWriter(res);

    writer.close();

    vi.advanceTimersByTime(60_000);
    expect(writes.filter((w) => w === ": ping\n\n").length).toBe(0);
  });

  it("send() and heartbeat() become no-ops after close()", () => {
    const { res, writes } = makeMockResponse();
    const writer = new SseWriter(res);

    writer.close();
    writer.send("phase", { phase: "done" });
    writer.heartbeat();

    expect(writes.length).toBe(0);
  });

  it("isClosed() reflects state", () => {
    const { res } = makeMockResponse();
    const writer = new SseWriter(res);

    expect(writer.isClosed()).toBe(false);
    writer.close();
    expect(writer.isClosed()).toBe(true);
  });
});
