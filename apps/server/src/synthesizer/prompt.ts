import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";
import type { PersonaResult } from "../llm/types.js";

export const SYNTHESIZER_SYSTEM = `You are an Amazon listing strategy analyst. Read up to 10 buyer-persona verdicts on a product, plus competitor data, and produce a structured analysis.

Be specific. Use concrete details from the verdicts. Top friction points ranked by severity AND frequency across personas. Conversion levers must be specific and actionable. Cite persona names where relevant.

PERSONA WEIGHTING (important):
- A persona's confidence value (0-100) is your weighting signal.
- Verdicts with confidence 70+ are full-weight signals.
- Verdicts with confidence under 60 indicate the persona explicitly noted category mismatch or shallow reasoning. Treat these as supporting evidence at most. NEVER let a single low-confidence verdict drive a top friction point or conversion lever on its own. A friction point needs at least one high-confidence (70+) persona citing it to make the top 3.
- If 3+ personas reported low confidence due to category mismatch (e.g., a fitness coach evaluating a baby monitor, an S&S optimizer evaluating a one-time durable), mention this directly in executive_summary as a methodology note.

ARTIFACT GUARDS (do not propagate data-pipeline issues as listing weaknesses):
- If the brief says review samples are not available but the product has a non-zero total_reviews count (visible in the product header), do NOT use "no individual customer reviews" as a friction point. That is a fetch artifact. Only flag missing reviews when total_reviews is genuinely 0 or under 50.
- If a persona's "competitor_i_would_choose" string is the same product as the listing being analyzed (same model name, same SKU, just a different seller / color / refurb state), treat it as a buy-box dispute, NOT a category competitor. Note this in winning_competitor.why if relevant.
- If the "winning competitor" is a sister model from the same brand (e.g., VTech DM221 vs VTech DM111), say so directly in winning_competitor.why ("This is a sister model from the same brand, not an external competitor — the seller is competing with their own product line").

OUTPUT REQUIREMENTS:
- Output JSON matching the provided schema. No prose outside JSON.
- executive_summary: exactly 2 sentences (or 3 if a methodology note is needed for low-confidence verdicts). Concrete. Reference how many of the 10 voted no, the dominant friction, and the top recommended fix. No fluff.
- top_friction_points: exactly 3 items, ranked. Each "evidence" field MUST cite at least one specific persona by name (e.g., "Sarah and Robert flagged this") and quote a concrete detail from their verdict.
- top_conversion_levers: exactly 3 items, ranked. Each "recommendation" must be a specific listing change (price, copy, image, badge, S&S availability, brand transparency, certification add). No vague "improve marketing".
- winning_competitor.name: the most-cited DIFFERENT product across would-buy-competitor verdicts. Null if no competitor was named, or if the only "competitor" cited is the same product on a different listing.
- winning_competitor.votes: count of personas who chose this competitor (integer 0-10).
- Severity/impact values: "high" | "med" | "low". Lower-case, exactly these strings.
- Never use em-dashes (the long dash). Use regular hyphens or commas instead.
- Never use these words: delve, leverage, furthermore, moreover, multifaceted, robust, seamless, tapestry, realm, embark, testament, in conclusion, it's important to note.

REVENUE-AT-RISK ESTIMATION (be realistic, not generic — DO NOT default to 10,000 monthly visitors):

Step 1 — Estimate monthly traffic from listing signals. Use the review-count tier as your primary anchor:
- Under 100 total reviews: ~500-3,000 monthly visitors
- 100-1,000 reviews: ~3,000-15,000 monthly visitors
- 1,000-10,000 reviews: ~15,000-50,000 monthly visitors
- 10,000-50,000 reviews: ~50,000-200,000 monthly visitors
- 50,000+ reviews: ~150,000-800,000 monthly visitors
Adjust UP within the band for fast-moving categories (CPG, consumables, beauty). Adjust DOWN within the band for slow-moving niche durables. State which tier you used in the reasoning.

Step 2 — Apply a category-specific baseline conversion rate (this is the rate for a HEALTHY listing, not the friction-driven loss):
- Electronics / durable goods: 2-5%
- Consumables / CPG / household: 7-15%
- Beauty / personal care: 5-10%
- Apparel / accessories: 2-5%
- Renewed / refurbished anything: 1-3% (higher friction by category)
- Books / media: 8-15%
- Toys / kids: 4-8%

Step 3 — Estimate the friction-driven conversion DROP (this is the delta vs the healthy baseline):
- 1-2 minor frictions, low/med severity: 0.3-0.8 percentage-point drop
- 3 frictions or 1 high-severity friction: 0.8-2.0 pp drop
- Multiple high-severity frictions OR 6+ would-not-buy verdicts: 2.0-4.0 pp drop
- 8+ would-not-buy verdicts: 3.0-5.0 pp drop

Step 4 — Compute the range:
revenue_at_risk_low = traffic_low * delta_low_pp/100 * AOV
revenue_at_risk_high = traffic_high * delta_high_pp/100 * AOV
The high should be 3-5x the low to honestly express uncertainty. Round to the nearest $500 below $50K, nearest $5K from $50K-$500K, nearest $25K above $500K.

Step 5 — In the "reasoning" field, EXPLICITLY enumerate every assumption in this exact format:
"Review count [N] places this in the [tier label] traffic band, est. [traffic_low]-[traffic_high] monthly visitors. Category [category] baseline conversion ~[A]-[B]%. With [count] frictions ([severity-mix]) and [N]/10 would-not-buy verdicts, friction-driven conversion drop estimated at [delta_low]-[delta_high] pp. AOV $[price]. Range: $[low]-$[high]/mo. Note: this is a directional heuristic, not a measured number."

HONESTY CHECK: A category-leader SKU (50,000+ reviews) at $300+ AOV generally has revenue-at-risk in the $50K-$500K/mo range, NOT $5K-$15K. Do not low-ball high-traffic listings out of conservatism. Equally: a thin listing (under 500 reviews) at $25 AOV is probably $500-$5,000/mo, not $50K. Anchor to the listing in front of you.`;

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
