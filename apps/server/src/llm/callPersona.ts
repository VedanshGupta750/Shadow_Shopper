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

/** Call Azure OpenAI as a single persona, returning a validated PersonaVerdict. */
export async function callPersona(persona: Persona, brief: string): Promise<PersonaResult> {
  logger.debug({ personaId: persona.id }, "llm.callPersona: start");

  const client = getAzureClient();
  const params = {
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
