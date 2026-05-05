import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getProductCached,
  getReviewsCached,
  searchAmazonCached,
} from "../src/scraper/index.js";
import { buildBrief } from "../src/personas/brief.js";
import { callPersona } from "../src/llm/callPersona.js";
import { PERSONAS } from "../src/personas/index.js";
import { streamSurfacing } from "../src/surfacing/run.js";
import { streamSynthesizer } from "../src/synthesizer/run.js";
import type {
  PersonaResult,
  SurfaceResult,
  SynthesisReport,
} from "../src/llm/types.js";
import type {
  AmazonProduct,
  AmazonReview,
  AmazonSearchResult,
} from "../src/types/amazon.js";

interface EvalOutput {
  asin: string;
  generatedAt: string;
  product: AmazonProduct | null;
  reviewsCount: number;
  reviewsSample: AmazonReview[];
  competitorsCount: number;
  competitors: AmazonSearchResult[];
  surfacing: { questions: string[]; results: SurfaceResult[] };
  personas: PersonaResult[];
  personaErrors: { personaId: string; message: string }[];
  synthesis: SynthesisReport | null;
  synthesisError: string | null;
  durations: {
    scrapeMs: number;
    surfacingMs: number;
    personasMs: number;
    synthesisMs: number;
    totalMs: number;
  };
  scrapeError: string | null;
}

function emptyResult(asin: string, scrapeError: string): EvalOutput {
  return {
    asin,
    generatedAt: new Date().toISOString(),
    product: null,
    reviewsCount: 0,
    reviewsSample: [],
    competitorsCount: 0,
    competitors: [],
    surfacing: { questions: [], results: [] },
    personas: [],
    personaErrors: [],
    synthesis: null,
    synthesisError: null,
    durations: {
      scrapeMs: 0,
      surfacingMs: 0,
      personasMs: 0,
      synthesisMs: 0,
      totalMs: 0,
    },
    scrapeError,
  };
}

async function evalAsin(asin: string): Promise<EvalOutput> {
  const t0 = Date.now();
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);
  log(`\n=== ${asin} ===`);

  // ===== SCRAPE =====
  log("scrape...");
  const scrapeStart = Date.now();
  let product: AmazonProduct;
  try {
    product = await getProductCached(asin);
    log(`  product: ${product.name.slice(0, 80)}`);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    log(`  product FAILED: ${m}`);
    return emptyResult(asin, m);
  }

  let reviews: AmazonReview[] = [];
  try {
    reviews = await getReviewsCached(asin, 100);
    log(`  reviews: ${reviews.length}`);
  } catch {
    log("  reviews unavailable");
  }

  let competitors: AmazonSearchResult[] = [];
  try {
    const query = product.name.split(" ").slice(0, 4).join(" ");
    competitors = await searchAmazonCached(query, 8);
    log(`  competitors: ${competitors.length}`);
  } catch {
    log("  competitors unavailable");
  }
  const scrapeMs = Date.now() - scrapeStart;

  const ctrl = new AbortController();

  // ===== SURFACING =====
  log("surfacing...");
  const surfacingStart = Date.now();
  const surfaceResults: SurfaceResult[] = [];
  let surfacingQuestions: string[] = [];
  for await (const e of streamSurfacing(product, competitors, ctrl.signal)) {
    if (e.type === "questions") surfacingQuestions = e.data.questions;
    else if (e.type === "cell-result") surfaceResults.push(e.data);
  }
  const greens = surfaceResults.filter((r) => r.score === "green").length;
  const reds = surfaceResults.filter((r) => r.score === "red").length;
  log(`  ${surfaceResults.length} cells (${greens} green, ${reds} red)`);
  const surfacingMs = Date.now() - surfacingStart;

  // ===== PERSONAS =====
  log("personas...");
  const personasStart = Date.now();
  const brief = buildBrief(product, reviews, competitors);
  const personaResults: PersonaResult[] = [];
  const personaErrors: { personaId: string; message: string }[] = [];

  await Promise.allSettled(
    PERSONAS.map(async (p) => {
      try {
        const r = await callPersona(p, brief);
        personaResults.push(r);
        process.stdout.write(`  ${p.id}:${r.verdict.verdict} `);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        personaErrors.push({ personaId: p.id, message: m });
        process.stdout.write(`  ${p.id}:ERR `);
      }
    }),
  );
  log("");
  const personasMs = Date.now() - personasStart;
  log(`  ${personaResults.length}/${PERSONAS.length} succeeded`);

  // ===== SYNTHESIS =====
  log("synthesis...");
  const synthesisStart = Date.now();
  let synthesis: SynthesisReport | null = null;
  let synthesisError: string | null = null;

  if (personaResults.length === 0) {
    synthesisError = "no successful persona verdicts";
  } else {
    for await (const e of streamSynthesizer(
      personaResults,
      product,
      competitors,
      ctrl.signal,
    )) {
      if (e.type === "done") synthesis = e.data.report;
      else if (e.type === "error") synthesisError = e.data.message;
    }
  }
  log(synthesis ? "  done" : `  failed: ${synthesisError}`);
  const synthesisMs = Date.now() - synthesisStart;

  return {
    asin,
    generatedAt: new Date().toISOString(),
    product,
    reviewsCount: reviews.length,
    reviewsSample: reviews.slice(0, 5),
    competitorsCount: competitors.length,
    competitors,
    surfacing: { questions: surfacingQuestions, results: surfaceResults },
    personas: personaResults.sort((a, b) =>
      a.personaId.localeCompare(b.personaId),
    ),
    personaErrors,
    synthesis,
    synthesisError,
    durations: {
      scrapeMs,
      surfacingMs,
      personasMs,
      synthesisMs,
      totalMs: Date.now() - t0,
    },
    scrapeError: null,
  };
}

async function main(): Promise<void> {
  const asins = process.argv.slice(2);
  if (asins.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: tsx scripts/eval-runner.ts <ASIN1> [ASIN2 ...]\n" +
        "Outputs JSON to <repo-root>/eval-results/{asin}.json",
    );
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../..");
  const outDir = path.join(repoRoot, "eval-results");
  fs.mkdirSync(outDir, { recursive: true });

  for (const asin of asins) {
    const result = await evalAsin(asin);
    const outFile = path.join(outDir, `${asin}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    // eslint-disable-next-line no-console
    console.log(`  → wrote ${outFile} (${result.durations.totalMs}ms)`);
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
