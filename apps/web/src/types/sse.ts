// MIRROR of apps/server/src/sse/types.ts and apps/server/src/llm/types.ts.
// IMPORTANT: these MUST match the server-side definitions exactly.
// If the server changes, update this file in lockstep.

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

export interface SynthesisReport {
  summary: string;
  top_friction_points: string[];
  buy_signals: string[];
  recommended_actions: string[];
}

export type SsePhase = "scraping" | "personas" | "synthesis" | "done";

export type SseEvent =
  | { event: "phase"; data: { phase: SsePhase } }
  | { event: "scrape-progress"; data: { stage: string; message: string } }
  | { event: "persona-token"; data: { personaId: string; token: string } }
  | { event: "persona-complete"; data: { personaId: string; verdict: PersonaVerdict } }
  | { event: "persona-error"; data: { personaId: string; message: string } }
  | { event: "synthesis-token"; data: { token: string } }
  | { event: "synthesis-complete"; data: { report: SynthesisReport } }
  | { event: "done"; data: { totalMs: number; totalCostUsd: number } }
  | { event: "error"; data: { message: string; code: string } };

export type SseEventName = SseEvent["event"];
