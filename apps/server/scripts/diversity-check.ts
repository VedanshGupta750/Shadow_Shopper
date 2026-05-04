import { getProductCached, getReviewsCached, searchAmazonCached } from "../src/scraper/index.js";
import { buildBrief } from "../src/personas/brief.js";
import { callPersona } from "../src/llm/callPersona.js";
import { PERSONAS } from "../src/personas/index.js";
import type { PersonaResult } from "../src/llm/types.js";
import type { AmazonReview, AmazonSearchResult } from "../src/types/amazon.js";

const asin = process.argv[2];
if (!asin) {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/diversity-check.ts <ASIN>");
  process.exit(1);
}

const BANNED_WORDS = [
  "delve", "leverage", "furthermore", "moreover", "multifaceted",
  "robust", "seamless", "tapestry", "realm", "embark", "testament",
  "in conclusion", "it's important to note",
];

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

async function main() {
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);

  log(`\n${C.bold}${C.cyan}=== Shadow Shopper - Diversity Check ===${C.reset}`);
  log(`${C.dim}ASIN: ${asin}${C.reset}`);
  log(`${C.dim}Personas: ${PERSONAS.length}${C.reset}\n`);

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
  log(`${C.dim}Brief: ${brief.length} chars${C.reset}\n`);

  const results: Array<{ name: string; role: string; result: PersonaResult }> = [];

  for (const persona of PERSONAS) {
    log(`${C.yellow}Running ${persona.name} (${persona.role})...${C.reset}`);
    const result = await callPersona(persona, brief);
    results.push({ name: persona.name, role: persona.role, result });
  }

  log(`\n${C.bold}${"═".repeat(70)}${C.reset}`);
  log(`${C.bold}${C.cyan}HEADLINE QUOTES (side by side)${C.reset}`);
  log(`${C.bold}${"═".repeat(70)}${C.reset}\n`);

  for (const { name, role, result } of results) {
    const verdictColor =
      result.verdict.verdict === "would-buy"
        ? C.green
        : result.verdict.verdict === "would-not-buy"
          ? C.red
          : C.yellow;

    const pad = `${name} (${role})`.padEnd(35);
    log(
      `${C.bold}${pad}${C.reset} ${verdictColor}${result.verdict.verdict.toUpperCase().padEnd(20)}${C.reset} ${C.cyan}"${result.verdict.headline_quote}"${C.reset}`,
    );
  }

  log(`\n${C.bold}${"═".repeat(70)}${C.reset}`);
  log(`${C.bold}${C.yellow}BANNED WORD CHECK${C.reset}`);
  log(`${C.bold}${"═".repeat(70)}${C.reset}\n`);

  let bannedHits = 0;
  for (const { name, result } of results) {
    const monologue = result.verdict.inner_monologue.toLowerCase();
    const quote = result.verdict.headline_quote.toLowerCase();
    const text = `${monologue} ${quote}`;

    for (const word of BANNED_WORDS) {
      if (text.includes(word.toLowerCase())) {
        log(`  ${C.red}BANNED${C.reset} ${C.bold}${name}${C.reset} used "${word}"`);
        bannedHits++;
      }
    }
  }

  if (bannedHits === 0) {
    log(`  ${C.green}No banned words found across any persona.${C.reset}`);
  } else {
    log(`\n  ${C.red}${bannedHits} banned word hit(s) total.${C.reset}`);
  }

  log(`\n${C.bold}${"═".repeat(70)}${C.reset}`);
  log(`${C.bold}${C.magenta}FIRST-SENTENCE DIVERSITY${C.reset}`);
  log(`${C.bold}${"═".repeat(70)}${C.reset}\n`);

  const firstWords: string[] = [];
  for (const { name, result } of results) {
    const firstSentence = result.verdict.inner_monologue.split(/[.!?]/)[0]?.trim() ?? "";
    const firstWord = firstSentence.split(/\s+/)[0]?.toLowerCase() ?? "";
    firstWords.push(firstWord);
    log(`  ${C.dim}${name.padEnd(12)}${C.reset} "${firstSentence.slice(0, 80)}${firstSentence.length > 80 ? "..." : ""}"`);
  }

  const uniqueOpeners = new Set(firstWords).size;
  const diversityPct = Math.round((uniqueOpeners / firstWords.length) * 100);
  const diversityColor = diversityPct >= 70 ? C.green : diversityPct >= 50 ? C.yellow : C.red;

  log(`\n  ${C.bold}Unique opening words:${C.reset} ${diversityColor}${uniqueOpeners}/${firstWords.length} (${diversityPct}%)${C.reset}`);

  log(`\n${C.bold}${"═".repeat(70)}${C.reset}`);
  log(`${C.bold}${C.cyan}VERDICT DISTRIBUTION${C.reset}`);
  log(`${C.bold}${"═".repeat(70)}${C.reset}\n`);

  const verdictCounts = { "would-buy": 0, "would-not-buy": 0, "would-buy-competitor": 0 };
  const confidences: number[] = [];
  for (const { result } of results) {
    verdictCounts[result.verdict.verdict]++;
    confidences.push(result.verdict.confidence);
  }

  log(`  ${C.green}Would buy:${C.reset}            ${verdictCounts["would-buy"]}`);
  log(`  ${C.red}Would not buy:${C.reset}        ${verdictCounts["would-not-buy"]}`);
  log(`  ${C.yellow}Would buy competitor:${C.reset} ${verdictCounts["would-buy-competitor"]}`);
  log(`  ${C.dim}Confidence range:${C.reset}     ${Math.min(...confidences)}-${Math.max(...confidences)} (avg ${Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)})`);

  log(`\n${C.bold}${C.cyan}=== Done ===${C.reset}\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`${C.red}Diversity check failed:${C.reset}`, err);
  process.exit(1);
});
