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
import { SseWriter } from "./writer.js";
import type { Persona, PersonaResult, SurfaceResult } from "../llm/types.js";
import type { AmazonReview, AmazonSearchResult } from "../types/amazon.js";

const StreamRequestZ = z.object({
  productUrl: z.string().url(),
});

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

  const writer = new SseWriter(res);
  const controller = new AbortController();

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

  try {
    writer.send("phase", { phase: "scraping" });

    writer.send("scrape-progress", { stage: "product", message: `Fetching product ${asin}` });
    const product = await getProductCached(asin);
    writer.send("scrape-progress", { stage: "product", message: `Got: ${product.name.slice(0, 80)}` });

    let reviews: AmazonReview[] = [];
    writer.send("scrape-progress", { stage: "reviews", message: "Fetching reviews" });
    try {
      reviews = await getReviewsCached(asin, 100);
      writer.send("scrape-progress", { stage: "reviews", message: `Got ${reviews.length} reviews` });
    } catch {
      writer.send("scrape-progress", { stage: "reviews", message: "Reviews unavailable, continuing" });
    }

    let competitors: AmazonSearchResult[] = [];
    writer.send("scrape-progress", { stage: "competitors", message: "Searching competitors" });
    try {
      const query = product.name.split(" ").slice(0, 4).join(" ");
      competitors = await searchAmazonCached(query, 8);
      writer.send("scrape-progress", { stage: "competitors", message: `Got ${competitors.length} competitors` });
    } catch {
      writer.send("scrape-progress", { stage: "competitors", message: "Competitors unavailable, continuing" });
    }

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    // ----- SURFACING PHASE -----
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

    logger.info(
      {
        requestId,
        asin,
        surfacingQuestionCount,
        surfacingCells: surfaceResults.length,
        surfacingGreens: surfaceResults.filter((r) => r.score === "green").length,
        surfacingReds: surfaceResults.filter((r) => r.score === "red").length,
      },
      "sse.handler: surfacing phase complete",
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    // ----- PERSONAS PHASE -----
    const brief = buildBrief(product, reviews, competitors);
    logger.info({ requestId, asin, briefChars: brief.length }, "sse.handler: brief built");

    writer.send("phase", { phase: "personas" });

    const personaTotals: PersonaTotals = { inputTokens: 0, outputTokens: 0 };
    const settled = await Promise.allSettled(
      PERSONAS.map((p) => runOnePersona(p, brief, controller.signal, writer, personaTotals)),
    );

    const successfulResults: PersonaResult[] = settled
      .filter((s): s is PromiseFulfilledResult<PersonaResult | null> => s.status === "fulfilled")
      .map((s) => s.value)
      .filter((v): v is PersonaResult => v !== null);

    logger.info(
      {
        requestId,
        asin,
        successCount: successfulResults.length,
        personaTotals,
      },
      "sse.handler: persona phase complete",
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    // ----- SYNTHESIS PHASE -----
    writer.send("phase", { phase: "synthesis" });

    const synthTotals: PersonaTotals = { inputTokens: 0, outputTokens: 0 };

    if (successfulResults.length === 0) {
      logger.warn({ requestId, asin }, "sse.handler: no successful verdicts, skipping synthesis");
      writer.send("synthesis-token", {
        token: "Synthesis skipped: no persona verdicts succeeded.",
      });
      writer.send("error", {
        message: "No persona verdicts to synthesize",
        code: "NO_VERDICTS",
      });
    } else {
      let synthesisCompleted = false;
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
          writer.send("error", {
            message: event.data.message,
            code: "SYNTHESIS_FAILED",
          });
        }
      }

      logger.info(
        { requestId, asin, synthTotals, synthesisCompleted },
        "sse.handler: synthesizer cost",
      );
    }

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
        requestId,
        asin,
        totalMs,
        totalCostUsd,
        personaTotals,
        synthTotals,
      },
      "sse.handler: stream complete",
    );

    writer.close();
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ requestId, asin, err: message }, "sse.handler: stream failed");
    if (!writer.isClosed()) {
      writer.send("error", { message, code: "STREAM_FAILED" });
      writer.close();
    }
    if (!res.writableEnded) res.end();
  } finally {
    req.off("close", onReqClose);
    res.off("close", onResClose);
  }
}
