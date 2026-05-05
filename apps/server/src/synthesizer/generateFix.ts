import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { getAzureClient, GPT_MODEL } from "../llm/client.js";
import { logger } from "../logger.js";
import { AppError, UpstreamError, ValidationError } from "../errors.js";
import type { GeneratedFix } from "../llm/types.js";

const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 1_200;
const TEMPERATURE = 0.7;

const GenerateFixRequestZ = z.object({
  lever: z.object({
    recommendation: z.string().min(1),
    reasoning: z.string().min(1),
  }),
  productContext: z.object({
    title: z.string(),
    brand: z.string(),
    currentBullets: z.array(z.string()),
  }),
  personaSignals: z.array(z.string()).max(5),
});

const generatedFixJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["bullet_rewrites", "a_plus_suggestion", "image_brief"],
  properties: {
    bullet_rewrites: {
      type: "array",
      items: { type: "string" },
    },
    a_plus_suggestion: { type: "string" },
    image_brief: { type: "string" },
  },
};

const GeneratedFixZ = z.object({
  bullet_rewrites: z.array(z.string().min(1)).min(3).max(5),
  a_plus_suggestion: z.string().min(1),
  image_brief: z.string().min(1),
});

const SYSTEM_PROMPT = `You are an Amazon listing copywriter. Given a conversion lever recommendation and product context, generate specific, paste-ready content the seller can copy into Seller Central. Reference concrete details from the product. Match the brand's existing voice. Be specific. No generic advice.

CRITICAL: Bullet rewrites must sound like a real seller, not Amazon marketing copy. Use specific numbers and concrete scenarios. NEVER use these phrases: "addressing key user concerns", "designed with X in mind", "optimizes", "enhances", "ensures". Replace abstract benefits with vivid specific moments. Example: instead of "extended battery life ensures peace of mind", write "12-hour battery — fully charged at bedtime, still running at 7 AM, no 3 AM beep."

A+ Content Suggestion must be a paste-ready paragraph the seller can drop directly into their A+ module. Write it as the final copy that will appear on the page, NOT as meta-instructions about what to do or which sections to add. No "Create a section that...", "Include a comparison chart...", "Add testimonials...". Just write the paragraph.

Image Brief must be a specific shot description — what is in the frame, who is holding what, where, when, lighting, composition. NOT a description of what kind of photo the seller should take. No "Design a lifestyle photo showing...", "Create an image that conveys...". Write what the camera sees: subjects, setting, props, action, time of day.`;

function buildUserPrompt(input: z.infer<typeof GenerateFixRequestZ>): string {
  const lines: string[] = [];

  lines.push("# CONVERSION LEVER");
  lines.push(`Recommendation: ${input.lever.recommendation}`);
  lines.push(`Reasoning: ${input.lever.reasoning}`);
  lines.push("");

  lines.push("# PRODUCT CONTEXT");
  lines.push(`Title: ${input.productContext.title || "(not provided)"}`);
  lines.push(`Brand: ${input.productContext.brand || "(not provided)"}`);
  if (input.productContext.currentBullets.length > 0) {
    lines.push("Current bullets:");
    for (const b of input.productContext.currentBullets) lines.push(`  - ${b}`);
  } else {
    lines.push("Current bullets: (not provided)");
  }
  lines.push("");

  lines.push("# PERSONA FRICTION SIGNALS");
  if (input.personaSignals.length === 0) {
    lines.push("(none provided)");
  } else {
    for (const s of input.personaSignals) lines.push(`- ${s}`);
  }
  lines.push("");

  lines.push("---");
  lines.push(
    "Produce a JSON object with: bullet_rewrites (3-5 complete bullet strings), a_plus_suggestion (one paragraph 80-150 words), image_brief (one paragraph 60-120 words describing a lifestyle photo).",
  );

  return lines.join("\n");
}

export async function generateFixHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const requestId = req.id;
  logger.info({ requestId }, "generateFix: enter");

  const parsed = GenerateFixRequestZ.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(
      { requestId, zodErrors: parsed.error.flatten() },
      "generateFix: invalid body",
    );
    throw new ValidationError("Invalid request body for /api/generate-fix");
  }

  const userPrompt = buildUserPrompt(parsed.data);

  const client = getAzureClient();
  const params = {
    model: GPT_MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: userPrompt },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "GeneratedFix",
        strict: true,
        schema: generatedFixJsonSchema,
      },
    },
  };

  let response;
  try {
    response = await client.chat.completions.create(params, {
      timeout: TIMEOUT_MS,
      maxRetries: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ requestId, err: message }, "generateFix: Azure call failed");
    throw new UpstreamError(`generate-fix LLM call failed: ${message}`);
  }

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    logger.error({ requestId }, "generateFix: empty response");
    throw new AppError("Empty response from Azure OpenAI", 502, "GENERATE_FIX_EMPTY");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(choice.message.content);
  } catch {
    logger.error(
      { requestId, rawContent: choice.message.content.slice(0, 1000) },
      "generateFix: JSON parse failed",
    );
    throw new AppError("generate-fix returned invalid JSON", 502, "GENERATE_FIX_PARSE_FAILED");
  }

  const validation = GeneratedFixZ.safeParse(raw);
  if (!validation.success) {
    logger.error(
      { requestId, raw, zodErrors: validation.error.flatten() },
      "generateFix: schema validation failed",
    );
    throw new AppError(
      "generate-fix output failed schema validation",
      502,
      "GENERATE_FIX_SCHEMA_FAILED",
    );
  }

  const result: GeneratedFix = validation.data;
  const usage = {
    input_tokens: response.usage?.prompt_tokens ?? 0,
    output_tokens: response.usage?.completion_tokens ?? 0,
  };

  logger.info({ requestId, usage }, "generateFix: exit");

  res.json(result);
}
