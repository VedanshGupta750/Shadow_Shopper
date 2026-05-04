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

export type Severity = "high" | "med" | "low";

/** Aggregated analysis across all 10 persona verdicts. */
export interface SynthesisReport {
  /** Number of personas (out of 10) whose verdict was "would-not-buy". */
  would_not_buy_count: number;
  /** 2-sentence executive summary citing concrete details from verdicts. */
  executive_summary: string;
  /** Top 3 friction points ranked by severity AND frequency across personas. */
  top_friction_points: {
    headline: string;
    severity: Severity;
    evidence: string;
  }[];
  /** Top 3 specific, actionable conversion levers. */
  top_conversion_levers: {
    recommendation: string;
    expected_impact: Severity;
    reasoning: string;
  }[];
  /** Most-mentioned competitor across "would-buy-competitor" verdicts. */
  winning_competitor: {
    name: string | null;
    why: string;
    votes: number;
  };
  /** Hedged monthly revenue at risk based on persona conversion delta. */
  revenue_at_risk_estimate: {
    monthly_usd_low: number;
    monthly_usd_high: number;
    reasoning: string;
  };
}

/** A free-form question a real shopper would ask an AI shopping assistant. */
export type BuyerQuestion = string;

/** AI shopping surface we simulate. Rufus is Amazon's; ChatGPT is OpenAI's shopping mode. */
export type AiSurface = "rufus" | "chatgpt";

export type SurfacingScore = "green" | "yellow" | "red";

/**
 * Result of one (question, surface) cell: did the listing surface in the simulated AI answer,
 * and at what position. Score buckets the position (or non-mention) into a traffic-light value.
 */
export interface SurfaceResult {
  question: BuyerQuestion;
  surface: AiSurface;
  answer_text: string;
  mentioned_target: boolean;
  /** 1-based position in the answer's product list. Null when not mentioned. */
  mentioned_position: number | null;
  score: SurfacingScore;
  /** Set when the simulator call failed. UI renders gray instead of the score color. */
  error: string | null;
}
