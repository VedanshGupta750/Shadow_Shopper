import { vi, describe, it, expect, beforeEach } from "vitest";
import type { PersonaVerdict } from "../types.js";
import { AppError } from "../../errors.js";

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("../client.js", () => ({
  getAzureClient: () => ({
    chat: { completions: { create: mockCreate } },
  }),
  GPT_MODEL: "gpt-4o",
  DEFAULT_MAX_TOKENS: 1024,
}));

import { callPersona } from "../callPersona.js";
import { sarah } from "../../personas/sarah.js";

const validVerdict: PersonaVerdict = {
  verdict: "would-not-buy",
  confidence: 72,
  inner_monologue: "I'm looking at this and honestly not feeling it.",
  friction_points: ["Price too high", "Suspicious reviews"],
  what_would_convert_me: ["Lower price", "More verified reviews"],
  trust_signals_missing: ["No real user photos"],
  competitor_i_would_choose: "Brand X Alternative",
  headline_quote: "Yeah, no. Not convinced this is worth the money.",
};

function mockSuccessResponse(verdict: PersonaVerdict = validVerdict) {
  return {
    choices: [{ message: { content: JSON.stringify(verdict) } }],
    usage: { prompt_tokens: 500, completion_tokens: 200 },
  };
}

describe("callPersona", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("passes correct model and strict schema to Azure OpenAI", async () => {
    // Arrange
    mockCreate.mockResolvedValueOnce(mockSuccessResponse());

    // Act
    await callPersona(sarah, "test brief");

    // Assert
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params] = mockCreate.mock.calls[0] as [Record<string, unknown>];
    expect(params["model"]).toBe("gpt-4o");
    expect(params["temperature"]).toBe(0.7);

    const fmt = params["response_format"] as Record<string, unknown>;
    expect(fmt["type"]).toBe("json_schema");

    const jsonSchema = fmt["json_schema"] as Record<string, unknown>;
    expect(jsonSchema["strict"]).toBe(true);

    const schema = jsonSchema["schema"] as Record<string, unknown>;
    expect(schema["additionalProperties"]).toBe(false);
  });

  it("returns parsed PersonaResult on success", async () => {
    // Arrange
    mockCreate.mockResolvedValueOnce(mockSuccessResponse());

    // Act
    const result = await callPersona(sarah, "test brief");

    // Assert
    expect(result.personaId).toBe("sarah-skeptical-mom");
    expect(result.verdict.verdict).toBe("would-not-buy");
    expect(result.verdict.confidence).toBe(72);
    expect(result.usage.input_tokens).toBe(500);
    expect(result.usage.output_tokens).toBe(200);
  });

  it("retries once on 429 then succeeds", async () => {
    // Arrange
    const error429 = Object.assign(new Error("Rate limited"), { status: 429 });
    mockCreate.mockRejectedValueOnce(error429).mockResolvedValueOnce(mockSuccessResponse());

    // Act
    const result = await callPersona(sarah, "test brief");

    // Assert
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.verdict.verdict).toBe("would-not-buy");
  });

  it("retries once on 500 then succeeds", async () => {
    // Arrange
    const error500 = Object.assign(new Error("Internal server error"), { status: 500 });
    mockCreate.mockRejectedValueOnce(error500).mockResolvedValueOnce(mockSuccessResponse());

    // Act
    const result = await callPersona(sarah, "test brief");

    // Assert
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.verdict.verdict).toBe("would-not-buy");
  });

  it("throws UpstreamError after both attempts fail on 5xx", async () => {
    // Arrange
    const error502 = Object.assign(new Error("Bad gateway"), { status: 502 });
    mockCreate.mockRejectedValue(error502);

    // Act & Assert
    await expect(callPersona(sarah, "test brief")).rejects.toThrow("LLM call failed");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws PERSONA_PARSE_FAILED on invalid JSON response", async () => {
    // Arrange
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json {{{" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    // Act & Assert
    try {
      await callPersona(sarah, "test brief");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("PERSONA_PARSE_FAILED");
    }
  });

  it("throws PERSONA_PARSE_FAILED on Zod validation failure", async () => {
    // Arrange
    const badVerdict = { verdict: "maybe", confidence: "high" };
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(badVerdict) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    // Act & Assert
    try {
      await callPersona(sarah, "test brief");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("PERSONA_PARSE_FAILED");
    }
  });

  it("does not retry on 400 client error", async () => {
    // Arrange
    const error400 = Object.assign(new Error("Bad request"), { status: 400 });
    mockCreate.mockRejectedValueOnce(error400);

    // Act & Assert
    await expect(callPersona(sarah, "test brief")).rejects.toThrow("LLM call failed");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
