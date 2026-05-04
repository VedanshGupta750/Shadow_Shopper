import pLimit from "p-limit";
import { generateBuyerQuestions } from "./questions.js";
import { simulateRufus } from "./rufus.js";
import { simulateChatGptShopping } from "./chatgpt.js";
import { scoreSurfacing } from "./score.js";
import { logger } from "../logger.js";
import type { AiSurface, SurfaceResult } from "../llm/types.js";
import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";

const SURFACES: readonly AiSurface[] = ["rufus", "chatgpt"] as const;
const CONCURRENCY = 4;

export type SurfacingStreamEvent =
  | { type: "questions"; data: { questions: string[] } }
  | { type: "cell-start"; data: { question: string; surface: AiSurface } }
  | { type: "cell-result"; data: SurfaceResult }
  | { type: "done"; data: { results: SurfaceResult[]; totalCostUsd: number } };

async function runOneCell(
  question: string,
  surface: AiSurface,
  product: AmazonProduct,
  competitors: AmazonSearchResult[],
  signal: AbortSignal,
): Promise<SurfaceResult> {
  try {
    const sim =
      surface === "rufus"
        ? await simulateRufus(question, product, competitors, signal)
        : await simulateChatGptShopping(question, product, competitors, signal);

    const score = scoreSurfacing(product.asin, product.name, sim.mentioned_products);

    return {
      question,
      surface,
      answer_text: sim.answer_text,
      mentioned_target: score.mentioned_target,
      mentioned_position: score.mentioned_position,
      score: score.score,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ surface, question, err: message }, "surfacing.runOneCell: failed");
    return {
      question,
      surface,
      answer_text: "",
      mentioned_target: false,
      mentioned_position: null,
      score: "red",
      error: message,
    };
  }
}

/**
 * Run the full surfacing audit:
 *  1. Generate 5 buyer questions (cached 24h by ASIN).
 *  2. For each question × surface (10 cells), call the simulator with concurrency 4.
 *  3. Stream events as cells start/finish.
 */
export async function* streamSurfacing(
  product: AmazonProduct,
  competitors: AmazonSearchResult[],
  signal: AbortSignal,
): AsyncGenerator<SurfacingStreamEvent, void, void> {
  if (signal.aborted) return;

  let questions: string[];
  try {
    questions = await generateBuyerQuestions(product, competitors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "surfacing.streamSurfacing: question generation failed");
    yield { type: "done", data: { results: [], totalCostUsd: 0 } };
    return;
  }

  yield { type: "questions", data: { questions } };

  const limit = pLimit(CONCURRENCY);
  const events: SurfacingStreamEvent[] = [];
  let resolveNext: (() => void) | null = null;
  const push = (e: SurfacingStreamEvent): void => {
    events.push(e);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  const allResults: SurfaceResult[] = [];

  const tasks: Array<{ question: string; surface: AiSurface }> = [];
  for (const q of questions) {
    for (const s of SURFACES) tasks.push({ question: q, surface: s });
  }

  const taskPromises = tasks.map((t) =>
    limit(async () => {
      if (signal.aborted) return;
      push({ type: "cell-start", data: { question: t.question, surface: t.surface } });
      const result = await runOneCell(t.question, t.surface, product, competitors, signal);
      allResults.push(result);
      push({ type: "cell-result", data: result });
    }),
  );

  let allDone = false;
  void Promise.allSettled(taskPromises).then(() => {
    allDone = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  });

  while (!allDone || events.length > 0) {
    if (signal.aborted) break;
    if (events.length > 0) {
      const next = events.shift();
      if (next) yield next;
    } else {
      await new Promise<void>((r) => {
        resolveNext = r;
      });
    }
  }

  yield { type: "done", data: { results: allResults, totalCostUsd: 0 } };
}
