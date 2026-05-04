import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("Health endpoints", () => {
  it("GET /healthz returns 200 with status ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(typeof res.body.uptime).toBe("number");
  });

  it("GET /readyz returns 200 when env is loaded", async () => {
    process.env["AZURE_ENDPOINT"] = "https://test.openai.azure.com";
    const freshApp = createApp();
    const res = await request(freshApp).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", envLoaded: true });
  });

  it("includes X-Request-Id header", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
  });
});
