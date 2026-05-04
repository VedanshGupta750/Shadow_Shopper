import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import type { PersonaVerdict } from "../../llm/types.js";

const validVerdict: PersonaVerdict = {
  verdict: "would-not-buy",
  confidence: 75,
  inner_monologue: "Test monologue",
  friction_points: ["price"],
  what_would_convert_me: ["lower price"],
  trust_signals_missing: [],
  competitor_i_would_choose: null,
  headline_quote: "Not buying.",
};

const { mockGetProduct, mockGetReviews, mockSearch, mockStreamPersona } = vi.hoisted(() => ({
  mockGetProduct: vi.fn(),
  mockGetReviews: vi.fn(),
  mockSearch: vi.fn(),
  mockStreamPersona: vi.fn(),
}));

vi.mock("../../scraper/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../scraper/index.js")>(
    "../../scraper/index.js",
  );
  return {
    ...actual,
    getProductCached: mockGetProduct,
    getReviewsCached: mockGetReviews,
    searchAmazonCached: mockSearch,
  };
});

vi.mock("../../llm/callPersona.js", () => ({
  streamPersona: mockStreamPersona,
}));

import { createApp } from "../../app.js";

const app = createApp();

async function* fakeStream(personaId: string) {
  yield { type: "token" as const, data: { text: `[${personaId}] hello` } };
  yield { type: "token" as const, data: { text: " world" } };
  yield {
    type: "done" as const,
    data: { verdict: validVerdict, usage: { input_tokens: 100, output_tokens: 50 } },
  };
}

function parseSseChunks(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = body.split("\n\n");
  for (const block of blocks) {
    if (!block.trim() || block.startsWith(":")) continue;
    const lines = block.split("\n");
    let event = "";
    const dataParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataParts.push(line.slice(6));
    }
    if (event) {
      try {
        events.push({ event, data: JSON.parse(dataParts.join("\n")) });
      } catch {
        events.push({ event, data: dataParts.join("\n") });
      }
    }
  }
  return events;
}

describe("streamPersonasHandler", () => {
  beforeEach(() => {
    mockGetProduct.mockReset();
    mockGetReviews.mockReset();
    mockSearch.mockReset();
    mockStreamPersona.mockReset();

    mockGetProduct.mockResolvedValue({
      asin: "B09V3KXJPB",
      name: "Test Product",
      brand: "TestBrand",
      price_string: "$29.99",
      rating: 4.5,
      total_reviews: 100,
      bullets: ["bullet1"],
      description: "desc",
      images: [],
      in_stock: true,
    });
    mockGetReviews.mockResolvedValue([]);
    mockSearch.mockResolvedValue([]);
    mockStreamPersona.mockImplementation((persona: { id: string }) => fakeStream(persona.id));
  });

  it("returns 400 when productUrl is missing", async () => {
    const res = await request(app).post("/api/stream-personas").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when productUrl has no extractable ASIN", async () => {
    const res = await request(app)
      .post("/api/stream-personas")
      .send({ productUrl: "https://example.com/not-amazon" });
    expect(res.status).toBe(400);
  });

  it("emits expected event sequence for valid request", async () => {
    const res = await request(app)
      .post("/api/stream-personas")
      .send({ productUrl: "https://www.amazon.com/dp/B09V3KXJPB" })
      .buffer(true)
      .parse((response, callback) => {
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf-8");
        });
        response.on("end", () => callback(null, body));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSseChunks(res.body as string);
    const eventNames = events.map((e) => e.event);

    expect(eventNames).toContain("phase");
    expect(eventNames).toContain("scrape-progress");
    expect(eventNames).toContain("persona-token");
    expect(eventNames).toContain("persona-complete");
    expect(eventNames).toContain("synthesis-complete");
    expect(eventNames).toContain("done");

    const phases = events.filter((e) => e.event === "phase").map((e) => (e.data as { phase: string }).phase);
    expect(phases).toEqual(["scraping", "personas", "synthesis", "done"]);

    const personaCompletes = events.filter((e) => e.event === "persona-complete");
    expect(personaCompletes.length).toBe(10);
  });

  it("emits persona-error events when streamPersona yields error", async () => {
    mockStreamPersona.mockImplementation(async function* (persona: { id: string }) {
      yield { type: "error", data: { message: `forced fail for ${persona.id}` } };
    });

    const res = await request(app)
      .post("/api/stream-personas")
      .send({ productUrl: "https://www.amazon.com/dp/B09V3KXJPB" })
      .buffer(true)
      .parse((response, callback) => {
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf-8");
        });
        response.on("end", () => callback(null, body));
      });

    const events = parseSseChunks(res.body as string);
    const errors = events.filter((e) => e.event === "persona-error");
    expect(errors.length).toBe(10);
  });
});
