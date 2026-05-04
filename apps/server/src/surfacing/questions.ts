import { getAzureClient, GPT_MODEL } from "../llm/client.js";
import { buyerQuestionsJsonSchema, BuyerQuestionsZ } from "../llm/schema.js";
import { cached } from "../scraper/cache.js";
import { logger } from "../logger.js";
import { AppError } from "../errors.js";
import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 30_000;

const QUESTIONS_SYSTEM = `You generate buyer questions for AI shopping research. Given a product, output 5 questions a real shopper would ask Rufus or ChatGPT before deciding to buy. The mix MUST be:
- 2 product-comparison questions (e.g., "How does X compare to Y for Z use case?")
- 1 use-case question (e.g., "Is X good for [specific scenario]?")
- 1 "best for X group" question (e.g., "What's the best option for [group]?")
- 1 problem-solution question (e.g., "What should I get if I need [X]?")

Questions must sound like a normal person typed them on their phone at 9pm. No corporate language. No "delve" or "leverage". Each question is one sentence, ends with a question mark.

Output JSON: { "questions": [string, string, string, string, string] }. Exactly 5 distinct questions.`;

function buildUserMessage(product: AmazonProduct, competitors: AmazonSearchResult[]): string {
  const lines: string[] = [];
  lines.push(`Product: ${product.name}`);
  lines.push(`Brand: ${product.brand}`);
  lines.push(`Price: ${product.price_string}`);
  if (product.bullets.length > 0) {
    lines.push("Key features:");
    for (const b of product.bullets.slice(0, 5)) lines.push(`  - ${b.slice(0, 150)}`);
  }
  if (competitors.length > 0) {
    lines.push("Competitors:");
    for (const c of competitors.slice(0, 5)) lines.push(`  - ${c.title.slice(0, 80)}`);
  }
  lines.push("");
  lines.push("Generate 5 buyer questions following the spec.");
  return lines.join("\n");
}

async function generateBuyerQuestionsUncached(
  product: AmazonProduct,
  competitors: AmazonSearchResult[],
): Promise<string[]> {
  const client = getAzureClient();
  const response = await client.chat.completions.create(
    {
      model: GPT_MODEL,
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: "system", content: QUESTIONS_SYSTEM },
        { role: "user", content: buildUserMessage(product, competitors) },
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "BuyerQuestions",
          strict: true,
          schema: buyerQuestionsJsonSchema,
        },
      },
    },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new AppError("Empty questions response", 502, "QUESTIONS_EMPTY");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError(`Questions JSON parse failed: ${content.slice(0, 200)}`, 502, "QUESTIONS_PARSE_FAILED");
  }

  const validation = BuyerQuestionsZ.safeParse(parsed);
  if (!validation.success) {
    throw new AppError("Questions schema validation failed", 502, "QUESTIONS_VALIDATION_FAILED");
  }

  const { questions } = validation.data;
  if (questions.length !== 5) {
    throw new AppError(`Expected 5 questions, got ${questions.length}`, 502, "QUESTIONS_WRONG_COUNT");
  }

  const trimmed = questions.map((q) => q.trim()).filter((q) => q.length > 0);
  if (trimmed.length !== 5) {
    throw new AppError("Some questions were empty after trim", 502, "QUESTIONS_EMPTY_ITEM");
  }

  const distinct = new Set(trimmed.map((q) => q.toLowerCase()));
  if (distinct.size !== 5) {
    throw new AppError("Questions are not distinct", 502, "QUESTIONS_NOT_DISTINCT");
  }

  logger.info({ count: trimmed.length, asin: product.asin }, "surfacing.questions: generated");
  return trimmed;
}

/** Generate 5 buyer questions for an ASIN. Cached 24h by ASIN via the filesystem cache. */
export function generateBuyerQuestions(
  product: AmazonProduct,
  competitors: AmazonSearchResult[],
): Promise<string[]> {
  return cached(`surfacing-questions:${product.asin}`, ONE_DAY_MS, () =>
    generateBuyerQuestionsUncached(product, competitors),
  );
}
