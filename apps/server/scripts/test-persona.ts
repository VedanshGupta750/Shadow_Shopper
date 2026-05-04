import { getProductCached, getReviewsCached, searchAmazonCached } from "../src/scraper/index.js";
import { buildBrief } from "../src/personas/brief.js";
import { callPersona } from "../src/llm/callPersona.js";
import { PERSONAS } from "../src/personas/index.js";
import type { Persona } from "../src/llm/types.js";
import type { AmazonReview, AmazonSearchResult } from "../src/types/amazon.js";

const asin = process.argv[2];
if (!asin) {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/test-persona.ts <ASIN> [personaId]");
  process.exit(1);
}

const personaId = process.argv[3];

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
} as const;

function printVerdict(persona: Persona, result: Awaited<ReturnType<typeof callPersona>>, elapsed: number) {
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);

  const verdictColor =
    result.verdict.verdict === "would-buy"
      ? C.green
      : result.verdict.verdict === "would-not-buy"
        ? C.red
        : C.yellow;

  log(`\n${C.bold}${"═".repeat(60)}${C.reset}`);
  log(`${C.bold}${C.magenta}${persona.name}'s Verdict (${persona.role})${C.reset} ${C.dim}(${elapsed}ms)${C.reset}`);
  log(`${C.bold}${"═".repeat(60)}${C.reset}`);

  log(`${C.bold}Decision:${C.reset}   ${verdictColor}${result.verdict.verdict.toUpperCase()}${C.reset}`);
  log(`${C.bold}Confidence:${C.reset} ${result.verdict.confidence}%`);
  log(`${C.bold}Quote:${C.reset}      ${C.cyan}"${result.verdict.headline_quote}"${C.reset}`);

  log(`\n${C.bold}Inner Monologue:${C.reset}`);
  log(result.verdict.inner_monologue);

  log(`\n${C.bold}${C.red}Friction Points:${C.reset}`);
  for (const f of result.verdict.friction_points) log(`  ${C.red}x${C.reset} ${f}`);

  log(`\n${C.bold}${C.green}What Would Convert Me:${C.reset}`);
  for (const w of result.verdict.what_would_convert_me) log(`  ${C.green}+${C.reset} ${w}`);

  log(`\n${C.bold}${C.yellow}Trust Signals Missing:${C.reset}`);
  for (const t of result.verdict.trust_signals_missing) log(`  ${C.yellow}!${C.reset} ${t}`);

  if (result.verdict.competitor_i_would_choose) {
    log(`\n${C.bold}Competitor Choice:${C.reset} ${result.verdict.competitor_i_would_choose}`);
  }

  log(`\n${C.dim}Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out${C.reset}`);
}

async function main() {
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);

  const personasToRun: Persona[] = personaId
    ? PERSONAS.filter((p) => p.id === personaId)
    : [...PERSONAS];

  if (personasToRun.length === 0) {
    log(`${C.red}No persona found with id "${personaId}"${C.reset}`);
    log(`${C.dim}Available: ${PERSONAS.map((p) => p.id).join(", ")}${C.reset}`);
    process.exit(1);
  }

  log(`\n${C.bold}${C.cyan}=== Shadow Shopper - Persona Test ===${C.reset}`);
  log(`${C.dim}ASIN: ${asin}${C.reset}`);
  log(`${C.dim}Personas: ${personasToRun.map((p) => p.name).join(", ")} (${personasToRun.length})${C.reset}\n`);

  log(`${C.yellow}Fetching product data...${C.reset}`);
  const product = await getProductCached(asin);
  log(`${C.green}Product:${C.reset} ${product.name}`);

  let reviews: AmazonReview[] = [];
  try {
    reviews = await getReviewsCached(asin, 10);
    log(`${C.green}Reviews:${C.reset} ${reviews.length} fetched`);
  } catch {
    log(`${C.yellow}Reviews:${C.reset} unavailable (continuing without)`);
  }

  let competitors: AmazonSearchResult[] = [];
  try {
    const query = product.name.split(" ").slice(0, 4).join(" ");
    competitors = await searchAmazonCached(query, 8);
    log(`${C.green}Competitors:${C.reset} ${competitors.length} found`);
  } catch {
    log(`${C.yellow}Competitors:${C.reset} unavailable (continuing without)`);
  }

  const brief = buildBrief(product, reviews, competitors);
  log(`\n${C.dim}Brief: ${brief.length} chars (~${Math.ceil(brief.length / 4)} tokens)${C.reset}`);
  log(`${C.dim}${"─".repeat(60)}${C.reset}`);
  log(brief);
  log(`${C.dim}${"─".repeat(60)}${C.reset}`);

  for (const persona of personasToRun) {
    log(`\n${C.yellow}Running ${persona.name} (${persona.role})...${C.reset}`);
    const start = Date.now();
    const result = await callPersona(persona, brief);
    const elapsed = Date.now() - start;
    printVerdict(persona, result, elapsed);
  }

  log(`\n${C.dim}Cost: $0.00 (Azure internship endpoint)${C.reset}`);
  log(`\n${C.bold}${C.cyan}=== Done ===${C.reset}\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`${C.red}Test persona failed:${C.reset}`, err);
  process.exit(1);
});
