import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AmazonProduct } from "../../types/amazon.js";

const { mockCreate, mockCached } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCached: vi.fn(),
}));

vi.mock("../../llm/client.js", () => ({
  getAzureClient: () => ({ chat: { completions: { create: mockCreate } } }),
  GPT_MODEL: "gpt-4o",
  DEFAULT_MAX_TOKENS: 1024,
}));

// Bypass the cache layer so we test the raw producer.
vi.mock("../../scraper/cache.js", () => ({
  cached: <T,>(_key: string, _ttl: number, producer: () => Promise<T>) => mockCached(producer),
}));

import { generateBuyerQuestions } from "../questions.js";

const product: AmazonProduct = {
  asin: "B09V3KXJPB",
  name: "Test Product",
  brand: "TestBrand",
  price_string: "$49.99",
  rating: 4.5,
  total_reviews: 100,
  bullets: ["bullet"],
  images: [],
  in_stock: true,
};

const validQuestions = [
  "How does this compare to the Sony alternative for daily commute use?",
  "Is this good for someone who travels a lot?",
  "What's the best wireless earbud for runners?",
  "Should I get this if I already own AirPods Pro 1st gen?",
  "How does this compare to Bose QC for noise cancelling?",
];

function mockResp(questions: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify({ questions }) } }],
    usage: { prompt_tokens: 200, completion_tokens: 100 },
  };
}

describe("generateBuyerQuestions", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCached.mockReset();
    mockCached.mockImplementation(async (producer: () => Promise<unknown>) => producer());
  });

  it("calls Azure with low temperature and structured output", async () => {
    mockCreate.mockResolvedValueOnce(mockResp(validQuestions));
    await generateBuyerQuestions(product, []);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params] = mockCreate.mock.calls[0] as [Record<string, unknown>];
    expect(params["model"]).toBe("gpt-4o");
    expect(params["temperature"]).toBe(0.3);

    const fmt = params["response_format"] as Record<string, unknown>;
    const jsonSchema = fmt["json_schema"] as Record<string, unknown>;
    expect(jsonSchema["name"]).toBe("BuyerQuestions");
    expect(jsonSchema["strict"]).toBe(true);
  });

  it("returns 5 distinct trimmed strings on success", async () => {
    mockCreate.mockResolvedValueOnce(mockResp(validQuestions));
    const out = await generateBuyerQuestions(product, []);
    expect(out).toHaveLength(5);
    expect(new Set(out.map((q) => q.toLowerCase())).size).toBe(5);
    for (const q of out) expect(q.length).toBeGreaterThan(0);
  });

  it("rejects when LLM returns wrong count", async () => {
    mockCreate.mockResolvedValueOnce(mockResp(validQuestions.slice(0, 3)));
    await expect(generateBuyerQuestions(product, [])).rejects.toThrow(/5 questions/i);
  });

  it("rejects when questions are duplicates", async () => {
    const dupes = [...validQuestions.slice(0, 4), validQuestions[0]] as string[];
    mockCreate.mockResolvedValueOnce(mockResp(dupes));
    await expect(generateBuyerQuestions(product, [])).rejects.toThrow(/distinct/i);
  });

  it("rejects on invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not json {{{" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    await expect(generateBuyerQuestions(product, [])).rejects.toThrow(/parse/i);
  });

  it("uses cache module with 24h TTL", async () => {
    mockCreate.mockResolvedValueOnce(mockResp(validQuestions));
    await generateBuyerQuestions(product, []);
    expect(mockCached).toHaveBeenCalledTimes(1);
  });
});
