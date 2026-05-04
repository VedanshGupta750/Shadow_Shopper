import { getAzureClient, GPT_MODEL, DEFAULT_MAX_TOKENS } from "./client.js";
import { personaVerdictJsonSchema, PersonaVerdictZ } from "./schema.js";
import { logger } from "../logger.js";
import { AppError, UpstreamError } from "../errors.js";
import type { Persona, PersonaResult, PersonaVerdict } from "./types.js";

const TIMEOUT_MS = 25_000;
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

function buildParams(persona: Persona, brief: string) {
  return {
    model: GPT_MODEL,
    temperature: 0.7,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [
      { role: "system" as const, content: persona.system },
      { role: "user" as const, content: brief },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "PersonaVerdict",
        strict: true,
        schema: personaVerdictJsonSchema,
      },
    },
  };
}

/** Call Azure OpenAI as a single persona, returning a validated PersonaVerdict. */
export async function callPersona(persona: Persona, brief: string): Promise<PersonaResult> {
  logger.debug({ personaId: persona.id }, "llm.callPersona: start");

  const client = getAzureClient();
  const params = buildParams(persona, brief);

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.chat.completions.create(params, {
        timeout: TIMEOUT_MS,
        maxRetries: 0,
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new AppError("Empty response from Azure OpenAI", 502, "PERSONA_EMPTY_RESPONSE");
      }

      let raw: unknown;
      try {
        raw = JSON.parse(choice.message.content);
      } catch {
        logger.error(
          { personaId: persona.id, rawContent: choice.message.content },
          "llm.callPersona: JSON parse failed",
        );
        throw new AppError(
          `Persona parse failed for ${persona.id}: invalid JSON`,
          502,
          "PERSONA_PARSE_FAILED",
        );
      }

      const validation = PersonaVerdictZ.safeParse(raw);
      if (!validation.success) {
        logger.error(
          { personaId: persona.id, raw, zodErrors: validation.error.flatten() },
          "llm.callPersona: Zod validation failed",
        );
        throw new AppError(
          `Persona parse failed for ${persona.id}: schema validation error`,
          502,
          "PERSONA_PARSE_FAILED",
        );
      }

      const verdict: PersonaVerdict = validation.data;
      const usage = {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      };

      logger.info(
        { personaId: persona.id, verdict: verdict.verdict, confidence: verdict.confidence, usage },
        "llm.callPersona: success",
      );

      return { personaId: persona.id, verdict, usage };
    } catch (error) {
      lastError = error;

      if (error instanceof AppError) throw error;

      if (attempt < MAX_ATTEMPTS - 1 && isRetryableStatus(error)) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        logger.warn(
          { personaId: persona.id, attempt, delayMs: Math.round(delay) },
          "llm.callPersona: retryable error, backing off",
        );
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  logger.error({ personaId: persona.id, err: lastError }, "llm.callPersona: failed after retries");
  throw new UpstreamError(
    `LLM call failed for persona ${persona.id}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** A streamed event from streamPersona. */
export type StreamPersonaEvent =
  | { type: "token"; data: { text: string } }
  | {
      type: "done";
      data: {
        verdict: PersonaVerdict;
        usage: { input_tokens: number; output_tokens: number };
      };
    }
  | { type: "error"; data: { message: string } };

/**
 * Stream Azure OpenAI tokens for a single persona.
 * Yields token events as they arrive, accumulates the full text, then yields done with parsed verdict.
 * Yields error (does not throw) on any failure including abort.
 */
export async function* streamPersona(
  persona: Persona,
  brief: string,
  signal: AbortSignal,
): AsyncGenerator<StreamPersonaEvent, void, void> {
  logger.debug({ personaId: persona.id }, "llm.streamPersona: start");

  if (signal.aborted) {
    yield { type: "error", data: { message: "aborted before start" } };
    return;
  }

  try {
    const client = getAzureClient();
    const params = {
      ...buildParams(persona, brief),
      stream: true as const,
      stream_options: { include_usage: true },
    };

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
      logger.error({ personaId: persona.id }, "llm.streamPersona: empty stream");
      yield { type: "error", data: { message: "empty stream" } };
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(accumulated);
    } catch {
      logger.error(
        { personaId: persona.id, rawContent: accumulated },
        "llm.streamPersona: JSON parse failed",
      );
      yield { type: "error", data: { message: "invalid JSON in stream" } };
      return;
    }

    const validation = PersonaVerdictZ.safeParse(raw);
    if (!validation.success) {
      logger.error(
        { personaId: persona.id, raw, zodErrors: validation.error.flatten() },
        "llm.streamPersona: Zod validation failed",
      );
      yield { type: "error", data: { message: "schema validation failed" } };
      return;
    }

    const verdict = validation.data;
    const usage = { input_tokens: inputTokens, output_tokens: outputTokens };

    logger.info(
      { personaId: persona.id, verdict: verdict.verdict, confidence: verdict.confidence, usage },
      "llm.streamPersona: success",
    );

    yield { type: "done", data: { verdict, usage } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof message === "string" && /abort/i.test(message));
    logger.warn(
      { personaId: persona.id, err: message, aborted: isAbort },
      "llm.streamPersona: stream ended with error",
    );
    yield { type: "error", data: { message: isAbort ? "aborted" : message } };
  }
}
