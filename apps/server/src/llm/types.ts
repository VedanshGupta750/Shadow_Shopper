/** The structured verdict a persona returns after evaluating a product. */
export interface PersonaVerdict {
  verdict: "would-buy" | "would-not-buy" | "would-buy-competitor";
  confidence: number;
  inner_monologue: string;
  friction_points: string[];
  what_would_convert_me: string[];
  trust_signals_missing: string[];
  competitor_i_would_choose: string | null;
  headline_quote: string;
}

/** A synthetic buyer persona definition. */
export interface Persona {
  id: string;
  name: string;
  age: number;
  city: string;
  role: string;
  system: string;
}

/** The result of running one persona through the LLM. */
export interface PersonaResult {
  personaId: string;
  verdict: PersonaVerdict;
  usage: { input_tokens: number; output_tokens: number };
}
