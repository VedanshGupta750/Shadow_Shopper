import type { PersonaVerdict } from "../llm/types.js";

/** Stub for Phase 7. Will be populated when synthesis is implemented. */
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
