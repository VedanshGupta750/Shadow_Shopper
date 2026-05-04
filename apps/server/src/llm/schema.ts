import { z } from "zod";

// -- JSON Schema for Azure OpenAI structured output (strict mode) --

type JsonSchemaNode = Record<string, unknown>;

export const personaVerdictJsonSchema: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict",
    "confidence",
    "inner_monologue",
    "friction_points",
    "what_would_convert_me",
    "trust_signals_missing",
    "competitor_i_would_choose",
    "headline_quote",
  ],
  properties: {
    verdict: {
      type: "string",
      enum: ["would-buy", "would-not-buy", "would-buy-competitor"],
    },
    confidence: {
      type: "number",
    },
    inner_monologue: {
      type: "string",
    },
    friction_points: {
      type: "array",
      items: { type: "string" },
    },
    what_would_convert_me: {
      type: "array",
      items: { type: "string" },
    },
    trust_signals_missing: {
      type: "array",
      items: { type: "string" },
    },
    competitor_i_would_choose: {
      type: ["string", "null"],
    },
    headline_quote: {
      type: "string",
    },
  },
};

const SEVERITY_ENUM = ["high", "med", "low"] as const;

export const synthesisReportJsonSchema: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  required: [
    "would_not_buy_count",
    "executive_summary",
    "top_friction_points",
    "top_conversion_levers",
    "winning_competitor",
    "revenue_at_risk_estimate",
  ],
  properties: {
    would_not_buy_count: { type: "number" },
    executive_summary: { type: "string" },
    top_friction_points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "severity", "evidence"],
        properties: {
          headline: { type: "string" },
          severity: { type: "string", enum: SEVERITY_ENUM },
          evidence: { type: "string" },
        },
      },
    },
    top_conversion_levers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["recommendation", "expected_impact", "reasoning"],
        properties: {
          recommendation: { type: "string" },
          expected_impact: { type: "string", enum: SEVERITY_ENUM },
          reasoning: { type: "string" },
        },
      },
    },
    winning_competitor: {
      type: "object",
      additionalProperties: false,
      required: ["name", "why", "votes"],
      properties: {
        name: { type: ["string", "null"] },
        why: { type: "string" },
        votes: { type: "number" },
      },
    },
    revenue_at_risk_estimate: {
      type: "object",
      additionalProperties: false,
      required: ["monthly_usd_low", "monthly_usd_high", "reasoning"],
      properties: {
        monthly_usd_low: { type: "number" },
        monthly_usd_high: { type: "number" },
        reasoning: { type: "string" },
      },
    },
  },
};

export const buyerQuestionsJsonSchema: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

/**
 * Walk a JSON schema tree and assert it meets Azure OpenAI strict-mode rules:
 * - Every object has `additionalProperties: false`
 * - Every object's `required` lists ALL its properties
 * - No `anyOf` or `oneOf` anywhere
 */
export function strictifySchema(schema: JsonSchemaNode): void {
  if (typeof schema !== "object" || schema === null) return;

  if ("anyOf" in schema) {
    throw new Error("strictifySchema: 'anyOf' is not allowed in Azure strict mode");
  }
  if ("oneOf" in schema) {
    throw new Error("strictifySchema: 'oneOf' is not allowed in Azure strict mode");
  }

  if (schema["type"] === "object") {
    if (schema["additionalProperties"] !== false) {
      throw new Error("strictifySchema: object missing additionalProperties: false");
    }

    const properties = schema["properties"] as Record<string, JsonSchemaNode> | undefined;
    const required = schema["required"] as string[] | undefined;

    if (properties) {
      const propKeys = Object.keys(properties);
      const missing = propKeys.filter((k) => !required?.includes(k));
      if (missing.length > 0) {
        throw new Error(`strictifySchema: properties not in required: ${missing.join(", ")}`);
      }
      for (const value of Object.values(properties)) {
        strictifySchema(value);
      }
    }
  }

  if (schema["type"] === "array" && schema["items"]) {
    strictifySchema(schema["items"] as JsonSchemaNode);
  }
}

// Validate at module load — fail fast if schema drifts
strictifySchema(personaVerdictJsonSchema);
strictifySchema(synthesisReportJsonSchema);
strictifySchema(buyerQuestionsJsonSchema);

// -- Zod schemas for runtime validation of LLM output --

export const PersonaVerdictZ = z.object({
  verdict: z.enum(["would-buy", "would-not-buy", "would-buy-competitor"]),
  confidence: z.number().min(0).max(100),
  inner_monologue: z.string(),
  friction_points: z.array(z.string()),
  what_would_convert_me: z.array(z.string()),
  trust_signals_missing: z.array(z.string()),
  competitor_i_would_choose: z.string().nullable(),
  headline_quote: z.string(),
});

const SeverityZ = z.enum(["high", "med", "low"]);

export const SynthesisReportZ = z.object({
  would_not_buy_count: z.number().int().min(0).max(10),
  executive_summary: z.string().min(1),
  top_friction_points: z.array(
    z.object({
      headline: z.string().min(1),
      severity: SeverityZ,
      evidence: z.string().min(1),
    }),
  ),
  top_conversion_levers: z.array(
    z.object({
      recommendation: z.string().min(1),
      expected_impact: SeverityZ,
      reasoning: z.string().min(1),
    }),
  ),
  winning_competitor: z.object({
    name: z.string().nullable(),
    why: z.string(),
    votes: z.number().int().min(0).max(10),
  }),
  revenue_at_risk_estimate: z.object({
    monthly_usd_low: z.number().min(0),
    monthly_usd_high: z.number().min(0),
    reasoning: z.string().min(1),
  }),
});

export const BuyerQuestionsZ = z.object({
  questions: z.array(z.string().min(1)),
});
