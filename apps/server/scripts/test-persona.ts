import { getProductCached, getReviewsCached, searchAmazonCached } from "../src/scraper/index.js";
import { buildBrief } from "../src/personas/brief.js";
import { callPersona } from "../src/llm/callPersona.js";
import { PERSONAS } from "../src/personas/index.js";
import { streamSynthesizer } from "../src/synthesizer/run.js";
import type { Persona, PersonaResult, SynthesisReport } from "../src/llm/types.js";
import type { AmazonReview, AmazonSearchResult } from "../src/types/amazon.js";

const asin = process.argv[2];
if (!asin) {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/test-persona.ts <ASIN> [personaId | --with-synth]");
  process.exit(1);
}

const arg3 = process.argv[3];
const withSynth = arg3 === "--with-synth";
const personaId = withSynth ? undefined : arg3;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
} as const;

function severityColor(s: "high" | "med" | "low"): string {
  if (s === "high") return C.red;
  if (s === "med") return C.yellow;
  return C.green;
}

function printVerdict(persona: Persona, result: PersonaResult, elapsed: number) {
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

function printSynthesis(report: SynthesisReport, elapsedMs: number, usage: { input_tokens: number; output_tokens: number }) {
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);

  log(`\n${C.bold}${"╔" + "═".repeat(70) + "╗"}${C.reset}`);
  log(`${C.bold}${C.blue}  SYNTHESIS REPORT  ${C.dim}(${elapsedMs}ms, ${usage.input_tokens} in / ${usage.output_tokens} out)${C.reset}`);
  log(`${C.bold}${"╚" + "═".repeat(70) + "╝"}${C.reset}`);

  log(`\n${C.bold}${C.red}WOULD NOT BUY:${C.reset} ${report.would_not_buy_count}/10`);
  log(`\n${C.bold}EXECUTIVE SUMMARY:${C.reset}`);
  log(report.executive_summary);

  log(`\n${C.bold}${C.red}TOP FRICTION POINTS:${C.reset}`);
  for (const f of report.top_friction_points) {
    const sev = severityColor(f.severity);
    log(`  ${sev}[${f.severity.toUpperCase()}]${C.reset} ${C.bold}${f.headline}${C.reset}`);
    log(`     ${C.dim}${f.evidence}${C.reset}`);
  }

  log(`\n${C.bold}${C.green}TOP CONVERSION LEVERS:${C.reset}`);
  for (const l of report.top_conversion_levers) {
    const imp = severityColor(l.expected_impact);
    log(`  ${imp}[${l.expected_impact.toUpperCase()}]${C.reset} ${C.bold}${l.recommendation}${C.reset}`);
    log(`     ${C.dim}${l.reasoning}${C.reset}`);
  }

  log(`\n${C.bold}${C.yellow}WINNING COMPETITOR:${C.reset}`);
  if (report.winning_competitor.name) {
    log(`  ${C.bold}${report.winning_competitor.name}${C.reset} (${report.winning_competitor.votes}/10 votes)`);
    log(`  ${C.dim}${report.winning_competitor.why}${C.reset}`);
  } else {
    log(`  ${C.dim}No clear winning competitor cited.${C.reset}`);
  }

  log(`\n${C.bold}${C.magenta}REVENUE AT RISK (monthly):${C.reset}`);
  log(`  $${report.revenue_at_risk_estimate.monthly_usd_low.toLocaleString()} - $${report.revenue_at_risk_estimate.monthly_usd_high.toLocaleString()}`);
  log(`  ${C.dim}${report.revenue_at_risk_estimate.reasoning}${C.reset}`);
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
  log(`${C.dim}Personas: ${personasToRun.map((p) => p.name).join(", ")} (${personasToRun.length})${C.reset}`);
  if (withSynth) log(`${C.dim}Synthesis: enabled${C.reset}`);
  log("");

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

  const results: PersonaResult[] = [];
  for (const persona of personasToRun) {
    log(`\n${C.yellow}Running ${persona.name} (${persona.role})...${C.reset}`);
    const start = Date.now();
    try {
      const result = await callPersona(persona, brief);
      const elapsed = Date.now() - start;
      results.push(result);
      printVerdict(persona, result, elapsed);
    } catch (err) {
      log(`${C.red}${persona.name} failed:${C.reset} ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (withSynth) {
    log(`\n${C.yellow}Running synthesizer over ${results.length} verdicts...${C.reset}`);
    const synthStart = Date.now();
    const controller = new AbortController();
    let report: SynthesisReport | null = null;
    let usage = { input_tokens: 0, output_tokens: 0 };
    let synthErr: string | null = null;
    let tokenCount = 0;

    for await (const event of streamSynthesizer(results, product, competitors, controller.signal)) {
      if (event.type === "token") {
        tokenCount++;
        process.stdout.write(C.dim + "." + C.reset);
      } else if (event.type === "done") {
        report = event.data.report;
        usage = event.data.usage;
      } else {
        synthErr = event.data.message;
      }
    }
    log("");

    if (report) {
      printSynthesis(report, Date.now() - synthStart, usage);
    } else {
      log(`${C.red}Synthesis failed:${C.reset} ${synthErr ?? "unknown"} (${tokenCount} tokens received)`);
    }
  }

  log(`\n${C.dim}Cost: $0.00 (Azure internship endpoint)${C.reset}`);
  log(`\n${C.bold}${C.cyan}=== Done ===${C.reset}\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`${C.red}Test persona failed:${C.reset}`, err);
  process.exit(1);
});
