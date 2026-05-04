import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { extractAsin, getProductCached, getReviewsCached, searchAmazonCached } from "../scraper/index.js";
import { buildBrief } from "../personas/brief.js";
import { PERSONAS } from "../personas/index.js";
import { streamPersona } from "../llm/callPersona.js";
import { logger } from "../logger.js";
import { ValidationError } from "../errors.js";
import { SseWriter } from "./writer.js";
import type { Persona } from "../llm/types.js";
import type { AmazonReview, AmazonSearchResult } from "../types/amazon.js";

const StreamRequestZ = z.object({
  productUrl: z.string().url(),
});

async function runOnePersona(
  persona: Persona,
  brief: string,
  signal: AbortSignal,
  writer: SseWriter,
  totals: { inputTokens: number; outputTokens: number },
): Promise<void> {
  try {
    for await (const event of streamPersona(persona, brief, signal)) {
      if (writer.isClosed()) return;
      if (event.type === "token") {
        writer.send("persona-token", { personaId: persona.id, token: event.data.text });
      } else if (event.type === "done") {
        totals.inputTokens += event.data.usage.input_tokens;
        totals.outputTokens += event.data.usage.output_tokens;
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

    const brief = buildBrief(product, reviews, competitors);
    logger.info({ requestId, asin, briefChars: brief.length }, "sse.handler: brief built");

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    writer.send("phase", { phase: "personas" });

    const totals = { inputTokens: 0, outputTokens: 0 };
    await Promise.allSettled(
      PERSONAS.map((p) => runOnePersona(p, brief, controller.signal, writer, totals)),
    );

    if (controller.signal.aborted) {
      writer.close();
      res.end();
      return;
    }

    writer.send("phase", { phase: "synthesis" });
    writer.send("synthesis-token", { token: "[synthesis comes in phase 7]" });
    writer.send("synthesis-complete", {
      report: {
        summary: "Synthesis stub - implemented in Phase 7",
        top_friction_points: [],
        buy_signals: [],
        recommended_actions: [],
      },
    });

    const totalMs = Date.now() - startedAt;
    const totalCostUsd = 0;

    writer.send("phase", { phase: "done" });
    writer.send("done", { totalMs, totalCostUsd });

    logger.info(
      { requestId, asin, totalMs, totalCostUsd, totals },
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
