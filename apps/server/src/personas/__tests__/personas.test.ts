import { describe, it, expect } from "vitest";
import { PERSONAS } from "../index.js";

describe("PERSONAS", () => {
  it("has exactly 10 personas", () => {
    expect(PERSONAS).toHaveLength(10);
  });

  it("every persona has a unique id", () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(PERSONAS.length);
  });

  it("every persona has a unique name", () => {
    const names = PERSONAS.map((p) => p.name);
    expect(new Set(names).size).toBe(PERSONAS.length);
  });

  it("every persona has a unique role", () => {
    const roles = PERSONAS.map((p) => p.role);
    expect(new Set(roles).size).toBe(PERSONAS.length);
  });

  it("every system prompt includes the banned-word list", () => {
    for (const persona of PERSONAS) {
      expect(persona.system).toContain("BANNED WORDS");
      expect(persona.system).toContain("delve");
      expect(persona.system).toContain("leverage");
      expect(persona.system).toContain("furthermore");
      expect(persona.system).toContain("em-dashes");
    }
  });

  it("every system prompt is longer than 600 characters", () => {
    for (const persona of PERSONAS) {
      expect(persona.system.length).toBeGreaterThan(600);
    }
  });

  it("personas are in the expected display order", () => {
    const expectedOrder = [
      "sarah-skeptical-mom",
      "robert-budget-senior",
      "maya-fitness-enthusiast",
      "david-gift-giver",
      "tasha-deal-hunter",
      "jordan-first-time-buyer",
      "patricia-brand-loyalist",
      "aiden-eco-conscious",
      "raj-value-engineer",
      "linnea-subscribe-save-optimizer",
    ];
    expect(PERSONAS.map((p) => p.id)).toEqual(expectedOrder);
  });
});
