import type { Response } from "express";
import { logger } from "../logger.js";
import type { SseEventName } from "./types.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Wraps an Express Response to write Server-Sent Events.
 * Sets SSE headers on construction, flushes headers, starts a heartbeat interval.
 */
export class SseWriter {
  private readonly res: Response;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(res: Response) {
    this.res = res;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  /** Write one SSE event. Payload is JSON-serialized; multi-line safe. */
  send(event: SseEventName, data: unknown): void {
    if (this.closed) return;

    const json = JSON.stringify(data);
    const lines = json.split("\n");
    const dataBlock = lines.map((l) => `data: ${l}`).join("\n");
    const frame = `event: ${event}\n${dataBlock}\n\n`;

    this.res.write(frame);
    logger.debug({ event, byteLen: frame.length }, "sse.send");
  }

  /** Comment-only frame to keep connection alive through proxies. */
  heartbeat(): void {
    if (this.closed) return;
    this.res.write(": ping\n\n");
  }

  /** Stop heartbeat, mark closed. Caller is responsible for res.end(). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  isClosed(): boolean {
    return this.closed;
  }
}
