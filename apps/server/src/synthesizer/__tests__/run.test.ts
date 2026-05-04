import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PersonaResult, SynthesisReport } from "../../llm/types.js";
import type { AmazonProduct, AmazonSearchResult } from "../../types/amazon.js";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("../../llm/client.js", () => ({
  getAzureClient: () => ({ chat: { completions: { create: mockCreate } } }),
  GPT_MODEL: "gpt-4o",
  DEFAULT_MAX_TOKENS: 1024,
}));

import { streamSynthesizer } from "../run.js";

const product: AmazonProduct = {
  asin: "B09TEST",
  name: "Test Widget",
  brand: "WCo",
  price_string: "$49.99",
  rating: 4.2,
  total_reviews: 100,
  bullets: ["bullet"],
  images: [],
  in_stock: true,
};

const competitors: AmazonSearchResult[] = [];

const sampleResult: PersonaResult = {
  personaId: "sarah-skeptical-mom",
  verdict: {
    verdict: "would-not-buy",
    confidence: 80,
    inner_monologue: "nope",
    friction_points: ["price"],
    what_would_convert_me: ["clearer info"],
    trust_signals_missing: ["certs"],
    competitor_i_would_choose: null,
    headline_quote: "no",
  },
  usage: { input_tokens: 0, output_tokens: 0 },
};

const validReport: SynthesisReport = {
  would_not_buy_count: 7,
  executive_summary: "Seven of ten personas would not buy. Price visibility was the dominant friction; surface the price before bullets.",
  top_friction_points: [
    { headline: "No price displayed", severity: "high", evidence: "Sarah and Robert both flagged missing price." },
    { headline: "Reviews look astroturfed", severity: "med", evidence: "Maya called out generic 5-star copy." },
    { headline: "Brand legitimacy unclear", severity: "med", evidence: "Jordan could not find a brand website." },
  ],
  top_conversion_levers: [
    { recommendation: "Show price above the bullets", expected_impact: "high", reasoning: "5 personas refused without price." },
    { recommendation: "Add USP/NSF certification badge", expected_impact: "med", reasoning: "Maya specifically required this." },
    { recommendation: "Enable Subscribe & Save", expected_impact: "med", reasoning: "Linnea cannot include without S&S." },
  ],
  winning_competitor: { name: "Competitor A", why: "Price visible, 4.5★", votes: 3 },
  revenue_at_risk_estimate: {
    monthly_usd_low: 12000,
    monthly_usd_high: 24000,
    reasoning: "Assumed 5000 monthly views, 2-4% conversion delta, $50 AOV.",
  },
};

async function* fakeStreamYieldingReport(reportJson: string) {
  // Stream the JSON in chunks
  const chunkSize = 50;
  for (let i = 0; i < reportJson.length; i += chunkSize) {
    yield {
      choices: [{ delta: { content: reportJson.slice(i, i + chunkSize) } }],
    };
  }
  yield { choices: [{ delta: {} }], usage: { prompt_tokens: 1500, completion_tokens: 600 } };
}

describe("streamSynthesizer", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("passes correct model, temperature, max_tokens, schema, and stream:true", async () => {
    mockCreate.mockResolvedValueOnce(fakeStreamYieldingReport(JSON.stringify(validReport)));

    const events: unknown[] = [];
    for await (const e of streamSynthesizer([sampleResult], product, competitors, new AbortController().signal)) {
      events.push(e);
    }

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params] = mockCreate.mock.calls[0] as [Record<string, unknown>];
    expect(params["model"]).toBe("gpt-4o");
    expect(params["temperature"]).toBe(0.5);
    expect(params["max_tokens"]).toBe(2000);
    expect(params["stream"]).toBe(true);

    const fmt = params["response_format"] as Record<string, unknown>;
    expect(fmt["type"]).toBe("json_schema");
    const jsonSchema = fmt["json_schema"] as Record<string, unknown>;
    expect(jsonSchema["name"]).toBe("SynthesisReport");
    expect(jsonSchema["strict"]).toBe(true);
  });

  it("yields token events then a done event with parsed report and usage", async () => {
    mockCreate.mockResolvedValueOnce(fakeStreamYieldingReport(JSON.stringify(validReport)));

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    for await (const e of streamSynthesizer([sampleResult], product, competitors, new AbortController().signal)) {
      events.push(e as { type: string; data: Record<string, unknown> });
    }

    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(1);

    const dones = events.filter((e) => e.type === "done");
    expect(dones.length).toBe(1);
    const doneData = dones[0]?.data as { report: SynthesisReport; usage: { input_tokens: number; output_tokens: number } };
    expect(doneData.report.would_not_buy_count).toBe(7);
    expect(doneData.report.top_friction_points.length).toBe(3);
    expect(doneData.usage.input_tokens).toBe(1500);
    expect(doneData.usage.output_tokens).toBe(600);
  });

  it("retries once on 429 then succeeds", async () => {
    const error429 = Object.assign(new Error("rate limited"), { status: 429 });
    mockCreate
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce(fakeStreamYieldingReport(JSON.stringify(validReport)));

    const events: Array<{ type: string }> = [];
    for await (const e of streamSynthesizer([sampleResult], product, competitors, new AbortController().signal)) {
      events.push(e as { type: string });
    }

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("yields error event when JSON parse fails", async () => {
    mockCreate.mockResolvedValueOnce(fakeStreamYieldingReport("not valid json {{{"));

    const events: Array<{ type: string; data: { message?: string } }> = [];
    for await (const e of streamSynthesizer([sampleResult], product, competitors, new AbortController().signal)) {
      events.push(e as { type: string; data: { message?: string } });
    }

    const errors = events.filter((e) => e.type === "error");
    expect(errors.length).toBe(1);
    expect(errors[0]?.data.message).toContain("invalid JSON");
  });

  it("yields error event when Zod validation fails", async () => {
    const invalid = { ...validReport, would_not_buy_count: 99 };
    mockCreate.mockResolvedValueOnce(fakeStreamYieldingReport(JSON.stringify(invalid)));

    const events: Array<{ type: string; data: { message?: string } }> = [];
    for await (const e of streamSynthesizer([sampleResult], product, competitors, new AbortController().signal)) {
      events.push(e as { type: string; data: { message?: string } });
    }

    const errors = events.filter((e) => e.type === "error");
    expect(errors.length).toBe(1);
    expect(errors[0]?.data.message).toContain("schema validation");
  });

  it("yields error and stops when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const events: Array<{ type: string }> = [];
    for await (const e of streamSynthesizer([sampleResult], product, competitors, controller.signal)) {
      events.push(e as { type: string });
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("error");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
