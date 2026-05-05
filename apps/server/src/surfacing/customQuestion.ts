import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { extractAsin, getProductCached, searchAmazonCached } from "../scraper/index.js";
import { simulateRufus } from "./rufus.js";
import { simulateChatGptShopping } from "./chatgpt.js";
import { scoreSurfacing } from "./score.js";
import { logger } from "../logger.js";
import { ValidationError } from "../errors.js";
import type { AiSurface, SurfaceResult } from "../llm/types.js";

const SurfaceQuestionRequestZ = z.object({
  productUrl: z.string().url(),
  question: z.string().min(5).max(300),
});

const HANDLER_TIMEOUT_MS = 90_000;

async function runOneSurface(
  surface: AiSurface,
  question: string,
  product: Awaited<ReturnType<typeof getProductCached>>,
  competitors: Awaited<ReturnType<typeof searchAmazonCached>>,
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
    logger.warn(
      { surface, question, err: message },
      "surfacing.customQuestion: surface call failed",
    );
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

export async function surfaceQuestionHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const requestId = req.id;

  const parsed = SurfaceQuestionRequestZ.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid request body: productUrl (URL) and question (5-300 chars) required",
    );
  }
  const { productUrl, question } = parsed.data;

  const asin = extractAsin(productUrl);
  if (!asin) {
    throw new ValidationError("Could not extract ASIN from productUrl");
  }

  logger.info({ requestId, asin, question: question.slice(0, 80) }, "surfaceQuestion: enter");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HANDLER_TIMEOUT_MS);
  req.on("close", () => controller.abort());

  try {
    const product = await getProductCached(asin);
    let competitors: Awaited<ReturnType<typeof searchAmazonCached>> = [];
    try {
      const query = product.name.split(" ").slice(0, 4).join(" ");
      competitors = await searchAmazonCached(query, 8);
    } catch {
      logger.warn({ requestId, asin }, "surfaceQuestion: competitor search failed, continuing");
    }

    const [rufus, chatgpt] = await Promise.all([
      runOneSurface("rufus", question, product, competitors, controller.signal),
      runOneSurface("chatgpt", question, product, competitors, controller.signal),
    ]);

    logger.info(
      {
        requestId,
        asin,
        rufusScore: rufus.score,
        chatgptScore: chatgpt.score,
        rufusPos: rufus.mentioned_position,
        chatgptPos: chatgpt.mentioned_position,
      },
      "surfaceQuestion: exit",
    );

    res.json({ results: [rufus, chatgpt] });
  } finally {
    clearTimeout(timeout);
  }
}
