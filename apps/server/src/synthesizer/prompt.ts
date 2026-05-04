import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";
import type { PersonaResult } from "../llm/types.js";

export const SYNTHESIZER_SYSTEM = `You are an Amazon listing strategy analyst. Read 10 buyer-persona verdicts on a product, plus competitor data, and produce a structured analysis.

Be specific. Use concrete details from the verdicts. Revenue estimates should be ranged and clearly hedged ("estimated $X-$Y/month based on competitor conversion delta"). Top friction points ranked by severity AND frequency across personas — friction mentioned by 5 personas > friction mentioned by 1. Conversion levers must be specific and actionable. Cite persona names where relevant.

OUTPUT REQUIREMENTS:
- Output JSON matching the provided schema. No prose outside JSON.
- executive_summary: exactly 2 sentences. Concrete. Reference how many of the 10 voted no, the dominant friction, and the top recommended fix. No fluff.
- top_friction_points: exactly 3 items, ranked. Each "evidence" field MUST cite at least one specific persona by name (e.g., "Sarah and Robert flagged this") and quote a concrete detail from their verdict.
- top_conversion_levers: exactly 3 items, ranked. Each "recommendation" must be a specific listing change (price, copy, image, badge, S&S availability, brand transparency, certification add). No vague "improve marketing".
- winning_competitor.name: the most-cited competitor across would-buy-competitor verdicts. Null if no competitor was named.
- winning_competitor.votes: count of personas who chose this competitor (integer 0-10).
- revenue_at_risk_estimate: low/high range in USD per month. The "reasoning" must show your math (assumed traffic, conversion delta, AOV).
- Severity/impact values: "high" | "med" | "low". Lower-case, exactly these strings.
- Never use em-dashes (the long dash). Use regular hyphens or commas instead.
- Never use these words: delve, leverage, furthermore, moreover, multifaceted, robust, seamless, tapestry, realm, embark, testament, in conclusion, it's important to note.`;

function summarizeVerdict(result: PersonaResult, persona: { name: string; role: string }): string {
  const v = result.verdict;
  const lines: string[] = [];
  lines.push(`### ${persona.name} (${persona.role})`);
  lines.push(`Verdict: ${v.verdict.toUpperCase()} (confidence ${v.confidence}%)`);
  lines.push(`Headline: "${v.headline_quote}"`);
  if (v.competitor_i_would_choose) {
    lines.push(`Would buy instead: ${v.competitor_i_would_choose}`);
  }
  if (v.friction_points.length > 0) {
    lines.push(`Friction points:`);
    for (const f of v.friction_points) lines.push(`  - ${f}`);
  }
  if (v.what_would_convert_me.length > 0) {
    lines.push(`Would convert me:`);
    for (const w of v.what_would_convert_me) lines.push(`  - ${w}`);
  }
  if (v.trust_signals_missing.length > 0) {
    lines.push(`Trust signals missing:`);
    for (const t of v.trust_signals_missing) lines.push(`  - ${t}`);
  }
  return lines.join("\n");
}

/** Build the user message for the synthesizer. Includes product, competitors, and all verdicts. */
export function buildSynthesisInput(
  results: PersonaResult[],
  product: AmazonProduct,
  competitors: AmazonSearchResult[],
  personaLookup: Map<string, { name: string; role: string }>,
): string {
  const lines: string[] = [];

  lines.push("# SYNTHESIS INPUT");
  lines.push("");
  lines.push(`Verdict count: ${results.length} of 10 personas successfully evaluated this listing.`);
  lines.push("");

  lines.push("## Product");
  lines.push(`Name: ${product.name}`);
  lines.push(`Brand: ${product.brand}`);
  lines.push(`Price: ${product.price_string}`);
  lines.push(`Rating: ${product.rating ?? "N/A"}/5 (${product.total_reviews ?? 0} reviews)`);
  if (product.bullets.length > 0) {
    lines.push("Key features:");
    for (const b of product.bullets.slice(0, 6)) lines.push(`  - ${b.slice(0, 200)}`);
  }
  lines.push("");

  lines.push("## Competitor alternatives");
  if (competitors.length === 0) {
    lines.push("None scraped. Use only the names personas mentioned in their verdicts.");
  } else {
    for (const c of competitors.slice(0, 8)) {
      const price = c.price_string ?? "no price";
      const rating = c.rating != null ? `${c.rating}★` : "no rating";
      lines.push(`- ${c.title.slice(0, 90)} | ${price} | ${rating}`);
    }
  }
  lines.push("");

  lines.push("## Persona verdicts");
  for (const r of results) {
    const meta = personaLookup.get(r.personaId) ?? { name: r.personaId, role: "?" };
    lines.push("");
    lines.push(summarizeVerdict(r, meta));
  }

  lines.push("");
  lines.push("---");
  lines.push("Produce the structured analysis JSON now.");

  return lines.join("\n");
}
