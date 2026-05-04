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

// -- Zod schema for runtime validation of LLM output --

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
