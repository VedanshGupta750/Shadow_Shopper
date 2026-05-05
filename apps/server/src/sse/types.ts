import type {
  AiSurface,
  PersonaVerdict,
  SurfaceResult,
  SynthesisReport,
} from "../llm/types.js";

export type { SynthesisReport, SurfaceResult, AiSurface } from "../llm/types.js";

export type SsePhase = "scraping" | "surfacing" | "personas" | "synthesis" | "done";

export interface ProductMeta {
  asin: string;
  name: string;
  brand: string;
  price: string;
  bullets: string[];
  rating: number | null;
  totalReviews: number | null;
}

export type SseEvent =
  | { event: "phase"; data: { phase: SsePhase } }
  | { event: "scrape-progress"; data: { stage: string; message: string } }
  | { event: "product-meta"; data: ProductMeta }
  | { event: "surfacing-questions"; data: { questions: string[] } }
  | { event: "surfacing-cell-start"; data: { question: string; surface: AiSurface } }
  | { event: "surfacing-cell-result"; data: SurfaceResult }
  | { event: "surfacing-complete"; data: { results: SurfaceResult[] } }
  | { event: "persona-token"; data: { personaId: string; token: string } }
  | { event: "persona-complete"; data: { personaId: string; verdict: PersonaVerdict } }
  | { event: "persona-error"; data: { personaId: string; message: string } }
  | { event: "synthesis-token"; data: { token: string } }
  | { event: "synthesis-complete"; data: { report: SynthesisReport } }
  | { event: "done"; data: { totalMs: number; totalCostUsd: number } }
  | { event: "error"; data: { message: string; code: string } };

export type SseEventName = SseEvent["event"];
