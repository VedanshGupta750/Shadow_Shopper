import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import type { PersonaVerdict, SynthesisReport } from "../../llm/types.js";

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

const validReport: SynthesisReport = {
  would_not_buy_count: 10,
  executive_summary: "Stub summary 1. Stub summary 2.",
  top_friction_points: [
    { headline: "F1", severity: "high", evidence: "ev1" },
    { headline: "F2", severity: "med", evidence: "ev2" },
    { headline: "F3", severity: "low", evidence: "ev3" },
  ],
  top_conversion_levers: [
    { recommendation: "L1", expected_impact: "high", reasoning: "r1" },
    { recommendation: "L2", expected_impact: "med", reasoning: "r2" },
    { recommendation: "L3", expected_impact: "low", reasoning: "r3" },
  ],
  winning_competitor: { name: null, why: "n/a", votes: 0 },
  revenue_at_risk_estimate: { monthly_usd_low: 1000, monthly_usd_high: 2000, reasoning: "stub" },
};

const { mockGetProduct, mockGetReviews, mockSearch, mockStreamPersona, mockStreamSynth, mockStreamSurf } = vi.hoisted(() => ({
  mockGetProduct: vi.fn(),
  mockGetReviews: vi.fn(),
  mockSearch: vi.fn(),
  mockStreamPersona: vi.fn(),
  mockStreamSynth: vi.fn(),
  mockStreamSurf: vi.fn(),
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

vi.mock("../../synthesizer/run.js", () => ({
  streamSynthesizer: mockStreamSynth,
}));

vi.mock("../../surfacing/run.js", () => ({
  streamSurfacing: mockStreamSurf,
}));

import { createApp } from "../../app.js";

const app = createApp();

async function* fakePersonaStream(personaId: string) {
  yield { type: "token" as const, data: { text: `[${personaId}] hello` } };
  yield {
    type: "done" as const,
    data: { verdict: validVerdict, usage: { input_tokens: 100, output_tokens: 50 } },
  };
}

async function* fakeSynthStream() {
  yield { type: "token" as const, data: { text: "synth tok 1 " } };
  yield { type: "token" as const, data: { text: "synth tok 2" } };
  yield {
    type: "done" as const,
    data: { report: validReport, usage: { input_tokens: 1500, output_tokens: 600 } },
  };
}

async function* fakeSurfacingStream() {
  const questions = ["q1?", "q2?", "q3?", "q4?", "q5?"];
  yield { type: "questions" as const, data: { questions } };
  const results: Array<{
    question: string;
    surface: "rufus" | "chatgpt";
    answer_text: string;
    mentioned_target: boolean;
    mentioned_position: number | null;
    score: "green" | "yellow" | "red";
    error: string | null;
  }> = [];
  for (const q of questions) {
    for (const s of ["rufus", "chatgpt"] as const) {
      yield { type: "cell-start" as const, data: { question: q, surface: s } };
      const result = {
        question: q,
        surface: s,
        answer_text: `mock answer for ${q} on ${s}`,
        mentioned_target: true,
        mentioned_position: 1,
        score: "green" as const,
        error: null,
      };
      results.push(result);
      yield { type: "cell-result" as const, data: result };
    }
  }
  yield { type: "done" as const, data: { results, totalCostUsd: 0 } };
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
    mockStreamSynth.mockReset();
    mockStreamSurf.mockReset();

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
    mockStreamPersona.mockImplementation((persona: { id: string }) => fakePersonaStream(persona.id));
    mockStreamSynth.mockImplementation(() => fakeSynthStream());
    mockStreamSurf.mockImplementation(() => fakeSurfacingStream());
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

  it("emits expected event sequence including synthesis", async () => {
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

    expect(eventNames).toContain("persona-token");
    expect(eventNames).toContain("persona-complete");
    expect(eventNames).toContain("surfacing-questions");
    expect(eventNames).toContain("surfacing-cell-start");
    expect(eventNames).toContain("surfacing-cell-result");
    expect(eventNames).toContain("surfacing-complete");
    expect(eventNames).toContain("synthesis-token");
    expect(eventNames).toContain("synthesis-complete");
    expect(eventNames).toContain("done");

    const phases = events.filter((e) => e.event === "phase").map((e) => (e.data as { phase: string }).phase);
    expect(phases).toEqual(["scraping", "surfacing", "personas", "synthesis", "done"]);

    const personaCompletes = events.filter((e) => e.event === "persona-complete");
    expect(personaCompletes.length).toBe(10);

    const synthCompletes = events.filter((e) => e.event === "synthesis-complete");
    expect(synthCompletes.length).toBe(1);
    const synthData = synthCompletes[0]?.data as { report: SynthesisReport };
    expect(synthData.report.would_not_buy_count).toBe(10);
    expect(synthData.report.top_friction_points.length).toBe(3);
  });

  it("calls streamSynthesizer once with all 10 successful results", async () => {
    await request(app)
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

    expect(mockStreamSynth).toHaveBeenCalledTimes(1);
    const [results] = mockStreamSynth.mock.calls[0] as [unknown[], ...unknown[]];
    expect(results.length).toBe(10);
  });

  it("skips synthesis and emits error when all personas fail", async () => {
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
    const personaErrors = events.filter((e) => e.event === "persona-error");
    expect(personaErrors.length).toBe(10);

    const synthCompletes = events.filter((e) => e.event === "synthesis-complete");
    expect(synthCompletes.length).toBe(0);

    const errors = events.filter((e) => e.event === "error");
    expect(errors.some((e) => (e.data as { code: string }).code === "NO_VERDICTS")).toBe(true);
    expect(mockStreamSynth).not.toHaveBeenCalled();
  });
});
