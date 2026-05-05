import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { extractAsin, getProductCached, getReviewsCached, searchAmazonCached } from "../scraper/index.js";
import { buildBrief } from "../personas/brief.js";
import { PERSONAS } from "../personas/index.js";
import { streamPersona } from "../llm/callPersona.js";
import { streamSynthesizer } from "../synthesizer/run.js";
import { streamSurfacing } from "../surfacing/run.js";
import { logger } from "../logger.js";
import { ValidationError } from "../errors.js";
import { recordDemo } from "../metrics.js";
import { SseWriter } from "./writer.js";
import type { Persona, PersonaResult, SurfaceResult } from "../llm/types.js";
import type { AmazonReview, AmazonSearchResult } from "../types/amazon.js";

const StreamRequestZ = z.object({
  productUrl: z.string().url(),
});

/** Handler-level timeout. Aborts all in-flight Azure calls + returns whatever has streamed. */
const TOTAL_HANDLER_TIMEOUT_MS = 4 * 60 * 1000;

/** Collapse newlines and truncate so error messages are safe to render in a single status line / toast. */
function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}

interface PersonaTotals {
  inputTokens: number;
  outputTokens: number;
}

async function runOnePersona(
  persona: Persona,
  brief: string,
  signal: AbortSignal,
  writer: SseWriter,
  totals: PersonaTotals,
): Promise<PersonaResult | null> {
  let result: PersonaResult | null = null;
  try {
    for await (const event of streamPersona(persona, brief, signal)) {
      if (writer.isClosed()) return result;
      if (event.type === "token") {
        writer.send("persona-token", { personaId: persona.id, token: event.data.text });
      } else if (event.type === "done") {
        totals.inputTokens += event.data.usage.input_tokens;
        totals.outputTokens += event.data.usage.output_tokens;
        result = {
          personaId: persona.id,
          verdict: event.data.verdict,
          usage: event.data.usage,
        };
        writer.send("persona-complete", {
          personaId: persona.id,
          verdict: event.data.verdict,
        });
      } else {
        writer.send("persona-error", {
          personaId: persona.id,
          message: event.data.message,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ personaId: persona.id, err: message }, "sse.handler: persona task crashed");
    if (!writer.isClosed()) {
      writer.send("persona-error", { personaId: persona.id, message });
    }
  }
  return result;
}

export async function streamPersonasHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const startedAt = Date.now();
  const requestId = req.id;

  const parseResult = StreamRequestZ.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError("Invalid request body: productUrl required (string URL)");
  }
  const { productUrl } = parseResult.data;

  const asin = extractAsin(productUrl);
  if (!asin) {
    throw new ValidationError("Could not extract ASIN from productUrl");
  }

  logger.info({ event: "demo_started", requestId, asin }, "demo started");

  const writer = new SseWriter(res);
  const controller = new AbortController();

  // Total handler timeout — aborts in-flight upstream calls if the demo runs too long.
  const totalTimeoutHandle = setTimeout(() => {
    if (!controller.signal.aborted) {
      logger.error(
        { event: "demo_error", requestId, asin, phase: "timeout", error: { code: "TOTAL_TIMEOUT", message: "demo exceeded 4-minute total handler timeout" } },
        "demo timeout",
      );
      controller.abort();
    }
  }, TOTAL_HANDLER_TIMEOUT_MS);

  const onClose = (source: string) => (): void => {
    if (!controller.signal.aborted) {
      logger.info(
        { requestId, asin, source },
        "sse.handler: client disconnected, aborting upstream calls",
      );
      controller.abort();
    }
    writer.close();
  };
  const onReqClose = onClose("req");
  const onResClose = onClose("res");
  req.on("close", onReqClose);
  res.on("close", onResClose);

  // Track per-phase metrics so we can emit demo_complete + record() at the end.
  let surfacingAttempted = 0;
  let surfacingSuccess = 0;
  let personaSuccessCount = 0;
  let demoErrored = false;
  const personaTotals: PersonaTotals = { inputTokens: 0, outputTokens: 0 };
  const synthTotals: PersonaTotals = { inputTokens: 0, outputTokens: 0 };

  try {
    // ===== SCRAPING =====
    const scrapingStart = Date.now();
    writer.send("phase", { phase: "scraping" });

    writer.send("scrape-progress", { stage: "product", message: `Fetching product ${asin}` });
    const product = await getProductCached(asin);
    writer.send("scrape-progress", { stage: "product", message: `Got: ${product.name.slice(0, 80)}` });
    writer.send("product-meta", {
      asin,
      name: product.name,
      brand: product.brand,
      price: product.price_string,
      bullets: product.bullets.slice(0, 8),
      rating: product.rating ?? null,
      totalReviews: product.total_reviews ?? null,
    });

    let reviews: AmazonReview[] = [];
    writer.send("scrape-progress", { stage: "reviews", message: "Fetching reviews" });
    try {
      reviews = await getReviewsCached(asin, 100);
      writer.send("scrape-progress", { stage: "reviews", message: `Got ${reviews.length} reviews` });
      if (reviews.length === 0) {
        logger.warn({ requestId, asin }, "sse.handler: 0 reviews returned");
      }
    } catch {
      logger.warn({ requestId, asin }, "sse.handler: reviews fetch failed");
      writer.send("scrape-progress", { stage: "reviews", message: "Reviews unavailable, continuing" });
    }

    let competitors: AmazonSearchResult[] = [];
    writer.send("scrape-progress", { stage: "competitors", message: "Searching competitors" });
    try {
      const query = product.name.split(" ").slice(0, 4).join(" ");
      competitors = await searchAmazonCached(query, 8);
      writer.send("scrape-progress", { stage: "competitors", message: `Got ${competitors.length} competitors` });
      if (competitors.length === 0) {
        logger.warn({ requestId, asin }, "sse.handler: 0 competitors returned");
        writer.send("scrape-progress", { stage: "competitors", message: "No competitors found" });
      }
    } catch {
      logger.warn({ requestId, asin }, "sse.handler: competitor search failed");
      writer.send("scrape-progress", { stage: "competitors", message: "Competitors unavailable, continuing" });
    }

    logger.info(
      {
        event: "phase_complete",
        phase: "scraping",
        durationMs: Date.now() - scrapingStart,
        requestId,
        asin,
        reviewsCount: reviews.length,
        competitorsCount: competitors.length,
      },
      "scraping complete",
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    // ===== SURFACING =====
    const surfacingStart = Date.now();
    writer.send("phase", { phase: "surfacing" });
    const surfaceResults: SurfaceResult[] = [];
    let surfacingQuestionCount = 0;

    for await (const event of streamSurfacing(product, competitors, controller.signal)) {
      if (writer.isClosed()) break;
      if (event.type === "questions") {
        surfacingQuestionCount = event.data.questions.length;
        writer.send("surfacing-questions", { questions: event.data.questions });
      } else if (event.type === "cell-start") {
        writer.send("surfacing-cell-start", {
          question: event.data.question,
          surface: event.data.surface,
        });
      } else if (event.type === "cell-result") {
        surfaceResults.push(event.data);
        writer.send("surfacing-cell-result", event.data);
      } else if (event.type === "done") {
        writer.send("surfacing-complete", { results: event.data.results });
      }
    }

    surfacingAttempted = surfaceResults.length;
    surfacingSuccess = surfaceResults.filter((r) => r.error === null).length;

    logger.info(
      {
        event: "phase_complete",
        phase: "surfacing",
        durationMs: Date.now() - surfacingStart,
        requestId,
        asin,
        surfacingQuestionCount,
        surfacingCells: surfacingAttempted,
        surfacingSuccess,
        surfacingGreens: surfaceResults.filter((r) => r.score === "green").length,
        surfacingReds: surfaceResults.filter((r) => r.score === "red").length,
      },
      "surfacing complete",
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    // ===== PERSONAS =====
    const personasStart = Date.now();
    const brief = buildBrief(product, reviews, competitors);
    logger.info({ requestId, asin, briefChars: brief.length }, "sse.handler: brief built");

    writer.send("phase", { phase: "personas" });

    const settled = await Promise.allSettled(
      PERSONAS.map((p) => runOnePersona(p, brief, controller.signal, writer, personaTotals)),
    );

    const successfulResults: PersonaResult[] = settled
      .filter((s): s is PromiseFulfilledResult<PersonaResult | null> => s.status === "fulfilled")
      .map((s) => s.value)
      .filter((v): v is PersonaResult => v !== null);

    personaSuccessCount = successfulResults.length;

    logger.info(
      {
        event: "phase_complete",
        phase: "personas",
        durationMs: Date.now() - personasStart,
        requestId,
        asin,
        personaSuccessCount,
        personaAttempted: PERSONAS.length,
        personaTotals,
      },
      "personas complete",
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    // ===== SYNTHESIS =====
    const synthesisStart = Date.now();
    writer.send("phase", { phase: "synthesis" });

    let synthesisCompleted = false;

    if (successfulResults.length === 0) {
      logger.warn({ requestId, asin }, "sse.handler: no successful verdicts, skipping synthesis");
      writer.send("error", {
        message: "Could not generate synthesis. No persona verdicts succeeded.",
        code: "NO_VERDICTS",
      });
    } else {
      for await (const event of streamSynthesizer(
        successfulResults,
        product,
        competitors,
        controller.signal,
      )) {
        if (writer.isClosed()) break;
        if (event.type === "token") {
          writer.send("synthesis-token", { token: event.data.text });
        } else if (event.type === "done") {
          synthTotals.inputTokens = event.data.usage.input_tokens;
          synthTotals.outputTokens = event.data.usage.output_tokens;
          writer.send("synthesis-complete", { report: event.data.report });
          synthesisCompleted = true;
        } else {
          // Synthesis failed (parse / validation / upstream). Send a non-fatal error so
          // the frontend renders the inline fallback while keeping persona verdicts intact.
          writer.send("error", {
            message: "Could not generate synthesis. Persona verdicts available below.",
            code: "SYNTHESIS_FAILED",
          });
        }
      }
    }

    logger.info(
      {
        event: "phase_complete",
        phase: "synthesis",
        durationMs: Date.now() - synthesisStart,
        requestId,
        asin,
        synthesisCompleted,
        synthTotals,
      },
      "synthesis complete",
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    const totalMs = Date.now() - startedAt;
    const totalCostUsd = 0; // Azure internship endpoint - logged for tracking only

    writer.send("phase", { phase: "done" });
    writer.send("done", { totalMs, totalCostUsd });

    logger.info(
      {
        event: "demo_complete",
        requestId,
        asin,
        totalDurationMs: totalMs,
        totalCostUsd,
        personaSuccessCount,
        personaAttempted: PERSONAS.length,
        surfacingSuccess,
        surfacingAttempted,
        synthesisCompleted,
      },
      "demo complete",
    );

    writer.close();
    res.end();
  } catch (error) {
    demoErrored = true;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = sanitizeErrorMessage(rawMessage);
    logger.error(
      {
        event: "demo_error",
        requestId,
        asin,
        phase: "stream",
        error: { code: "STREAM_FAILED", message: rawMessage },
      },
      "demo failed",
    );
    if (!writer.isClosed()) {
      writer.send("error", { message, code: "STREAM_FAILED" });
      writer.close();
    }
    if (!res.writableEnded) res.end();
  } finally {
    clearTimeout(totalTimeoutHandle);
    req.off("close", onReqClose);
    res.off("close", onResClose);

    recordDemo({
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      personaSuccess: personaSuccessCount,
      personaAttempted: PERSONAS.length,
      surfacingSuccess,
      surfacingAttempted,
      errored: demoErrored,
    });
  }
}
