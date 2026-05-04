import { describe, it, expect } from "vitest";
import { buildSynthesisInput, SYNTHESIZER_SYSTEM } from "../prompt.js";
import type { PersonaResult } from "../../llm/types.js";
import type { AmazonProduct, AmazonSearchResult } from "../../types/amazon.js";

const product: AmazonProduct = {
  asin: "B09TEST",
  name: "Test Widget Pro 3000",
  brand: "WidgetCo",
  price_string: "$49.99",
  rating: 4.2,
  total_reviews: 1500,
  bullets: ["Durable steel", "Lifetime warranty"],
  description: "Best widget money can buy.",
  images: [],
  in_stock: true,
};

const competitors: AmazonSearchResult[] = [
  { asin: "B000C1", title: "Competitor A", url: "/dp/B000C1", price_string: "$39.99", rating: 4.5 },
  { asin: "B000C2", title: "Competitor B", url: "/dp/B000C2", price_string: "$59.99", rating: 3.8 },
];

function makeVerdict(overrides: Partial<PersonaResult["verdict"]>): PersonaResult["verdict"] {
  return {
    verdict: "would-not-buy",
    confidence: 75,
    inner_monologue: "Default monologue",
    friction_points: ["Some friction"],
    what_would_convert_me: ["lower price"],
    trust_signals_missing: ["no certs"],
    competitor_i_would_choose: null,
    headline_quote: "Default quote",
    ...overrides,
  };
}

const sarahResult: PersonaResult = {
  personaId: "sarah-skeptical-mom",
  verdict: makeVerdict({
    verdict: "would-not-buy",
    headline_quote: "Yeah no, the reviews are sus",
    friction_points: ["Too many fake-looking reviews", "No price visible"],
    what_would_convert_me: ["More verified buyer photos"],
    competitor_i_would_choose: "Competitor A",
  }),
  usage: { input_tokens: 500, output_tokens: 200 },
};

const robertResult: PersonaResult = {
  personaId: "robert-budget-senior",
  verdict: makeVerdict({
    verdict: "would-not-buy",
    headline_quote: "Now hold on, no price listed.",
    friction_points: ["Per-unit cost unclear"],
    competitor_i_would_choose: "Competitor A",
  }),
  usage: { input_tokens: 500, output_tokens: 200 },
};

const personaLookup = new Map([
  ["sarah-skeptical-mom", { name: "Sarah", role: "Skeptical Mom" }],
  ["robert-budget-senior", { name: "Robert", role: "Budget Senior" }],
]);

describe("buildSynthesisInput", () => {
  it("includes product info and price", () => {
    const out = buildSynthesisInput([sarahResult, robertResult], product, competitors, personaLookup);
    expect(out).toContain("Test Widget Pro 3000");
    expect(out).toContain("WidgetCo");
    expect(out).toContain("$49.99");
    expect(out).toContain("4.2");
  });

  it("lists scraped competitors with prices", () => {
    const out = buildSynthesisInput([sarahResult, robertResult], product, competitors, personaLookup);
    expect(out).toContain("Competitor A");
    expect(out).toContain("$39.99");
    expect(out).toContain("Competitor B");
  });

  it("notes when no competitor data was scraped", () => {
    const out = buildSynthesisInput([sarahResult], product, [], personaLookup);
    expect(out).toContain("None scraped");
  });

  it("includes the verdict count out of 10", () => {
    const out = buildSynthesisInput([sarahResult, robertResult], product, competitors, personaLookup);
    expect(out).toContain("Verdict count: 2 of 10");
  });

  it("formats each persona verdict with name, role, headline, friction", () => {
    const out = buildSynthesisInput([sarahResult, robertResult], product, competitors, personaLookup);
    expect(out).toContain("Sarah (Skeptical Mom)");
    expect(out).toContain("Robert (Budget Senior)");
    expect(out).toContain("WOULD-NOT-BUY");
    expect(out).toContain("Yeah no, the reviews are sus");
    expect(out).toContain("Now hold on, no price listed.");
    expect(out).toContain("Too many fake-looking reviews");
    expect(out).toContain("Per-unit cost unclear");
  });

  it("falls back to personaId when persona is not in lookup", () => {
    const orphan: PersonaResult = {
      personaId: "unknown-persona",
      verdict: makeVerdict({ headline_quote: "I am orphan" }),
      usage: { input_tokens: 0, output_tokens: 0 },
    };
    const out = buildSynthesisInput([orphan], product, [], new Map());
    expect(out).toContain("unknown-persona");
  });
});

describe("SYNTHESIZER_SYSTEM", () => {
  it("instructs structured JSON output", () => {
    expect(SYNTHESIZER_SYSTEM).toContain("OUTPUT REQUIREMENTS");
    expect(SYNTHESIZER_SYSTEM).toContain("executive_summary");
    expect(SYNTHESIZER_SYSTEM).toContain("top_friction_points");
    expect(SYNTHESIZER_SYSTEM).toContain("revenue_at_risk_estimate");
  });

  it("requires citing personas by name in evidence", () => {
    expect(SYNTHESIZER_SYSTEM).toContain("cite at least one specific persona by name");
  });

  it("forbids em-dashes and banned words", () => {
    expect(SYNTHESIZER_SYSTEM).toContain("em-dashes");
    expect(SYNTHESIZER_SYSTEM).toContain("delve");
    expect(SYNTHESIZER_SYSTEM).toContain("leverage");
  });
});
