import { getAzureClient, GPT_MODEL } from "../llm/client.js";
import { synthesisReportJsonSchema, SynthesisReportZ } from "../llm/schema.js";
import { buildSynthesisInput, SYNTHESIZER_SYSTEM } from "./prompt.js";
import { logger } from "../logger.js";
import { PERSONAS } from "../personas/index.js";
import type { PersonaResult, SynthesisReport } from "../llm/types.js";
import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";

const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 2_000;
const TEMPERATURE = 0.5;
const RETRY_BASE_MS = 1_000;
const MAX_ATTEMPTS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(error: unknown): boolean {
  if (error instanceof Error && "status" in error) {
    const { status } = error;
    return typeof status === "number" && (status === 429 || status >= 500);
  }
  return false;
}

function buildPersonaLookup(): Map<string, { name: string; role: string }> {
  const map = new Map<string, { name: string; role: string }>();
  for (const p of PERSONAS) map.set(p.id, { name: p.name, role: p.role });
  return map;
}

export type SynthesizerStreamEvent =
  | { type: "token"; data: { text: string } }
  | {
      type: "done";
      data: {
        report: SynthesisReport;
        usage: { input_tokens: number; output_tokens: number };
      };
    }
  | { type: "error"; data: { message: string } };

/**
 * Stream a synthesis report from Azure OpenAI given persona verdicts.
 * Yields token events, then a final done with parsed/validated report.
 * Retries once on 429/5xx. Yields error (does not throw) on terminal failure.
 */
export async function* streamSynthesizer(
  results: PersonaResult[],
  product: AmazonProduct,
  competitors: AmazonSearchResult[],
  signal: AbortSignal,
): AsyncGenerator<SynthesizerStreamEvent, void, void> {
  logger.debug({ resultCount: results.length }, "synthesizer.streamSynthesizer: start");

  if (signal.aborted) {
    yield { type: "error", data: { message: "aborted before start" } };
    return;
  }

  const personaLookup = buildPersonaLookup();
  const userMessage = buildSynthesisInput(results, product, competitors, personaLookup);

  const client = getAzureClient();
  const params = {
    model: GPT_MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    stream: true as const,
    stream_options: { include_usage: true },
    messages: [
      { role: "system" as const, content: SYNTHESIZER_SYSTEM },
      { role: "user" as const, content: userMessage },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "SynthesisReport",
        strict: true,
        schema: synthesisReportJsonSchema,
      },
    },
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const stream = await client.chat.completions.create(params, {
        timeout: TIMEOUT_MS,
        maxRetries: 0,
        signal,
      });

      let accumulated = "";
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          accumulated += token;
          yield { type: "token", data: { text: token } };
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
      }

      if (!accumulated) {
        logger.error({}, "synthesizer.streamSynthesizer: empty stream");
        yield { type: "error", data: { message: "empty stream" } };
        return;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(accumulated);
      } catch {
        logger.error(
          { rawContent: accumulated.slice(0, 1000) },
          "synthesizer.streamSynthesizer: JSON parse failed",
        );
        yield { type: "error", data: { message: "synthesizer returned invalid JSON" } };
        return;
      }

      const validation = SynthesisReportZ.safeParse(raw);
      if (!validation.success) {
        logger.error(
          { raw, zodErrors: validation.error.flatten() },
          "synthesizer.streamSynthesizer: Zod validation failed",
        );
        yield {
          type: "error",
          data: { message: "synthesizer output failed schema validation" },
        };
        return;
      }

      const report = validation.data;
      const usage = { input_tokens: inputTokens, output_tokens: outputTokens };

      logger.info(
        {
          would_not_buy_count: report.would_not_buy_count,
          friction_count: report.top_friction_points.length,
          lever_count: report.top_conversion_levers.length,
          winning_competitor: report.winning_competitor.name,
          revenue_low: report.revenue_at_risk_estimate.monthly_usd_low,
          revenue_high: report.revenue_at_risk_estimate.monthly_usd_high,
          usage,
        },
        "synthesizer.streamSynthesizer: success",
      );

      yield { type: "done", data: { report, usage } };
      return;
    } catch (error) {
      lastError = error;
      const isAbort =
        error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));

      if (isAbort) {
        logger.warn({}, "synthesizer.streamSynthesizer: aborted");
        yield { type: "error", data: { message: "aborted" } };
        return;
      }

      if (attempt < MAX_ATTEMPTS - 1 && isRetryableStatus(error)) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        logger.warn(
          { attempt, delayMs: Math.round(delay) },
          "synthesizer.streamSynthesizer: retryable error, backing off",
        );
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  logger.error({ err: message }, "synthesizer.streamSynthesizer: failed after retries");
  yield { type: "error", data: { message } };
}
