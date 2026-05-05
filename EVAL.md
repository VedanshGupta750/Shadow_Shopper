# Shadow Shopper Evaluation

## Methodology
We ran the full pipeline on 3 Amazon ASINs across categories. For each, we evaluated persona output quality (in-character? specific? distinct?), surfacing accuracy (do scores match a manual gut check?), synthesis usefulness (specific? cites personas? ranges revenue appropriately?), and failure modes. JSON outputs are in `eval-results/`. Run via `tsx apps/server/scripts/eval-runner.ts <ASIN...>`.

**Caveat that affects every result below:** ScraperAPI's `/review` endpoint returned 404 on all 3 ASINs in this run, so the persona brief contained the aggregate rating and review count but **zero review text**. This is why "no individual customer reviews" appears as a friction point on every listing — it is partly an artifact of the data pipeline, not the listings themselves.

## ASIN 1: VTech Audio Baby Monitor (B00JEV5UI8)
**Category:** Baby tech (audio monitor, $21.95, 4.4★ / 43,861 reviews)
**Synth verdict:** 4/10 would not buy; "lack of detailed reviews" cited as dominant friction; recommends adding reviews + warranty + sustainability info. Revenue at risk: $5K-$8K/mo.
**What worked:** Tasha's "Let me check CamelCamelCamel — this price has stayed steady, that's not a deal" is exactly her character — she names a real shopper tool unprompted. Aiden, Raj, and Tasha all surfaced concrete VTech model numbers (DM1211, DM221) with prices and ratings, which the synthesis aggregated into a "winning competitor" with 3 votes. Surfacing was the most varied of the three runs (3 green / 3 yellow / 4 red), which feels honest for a low-cost SKU that competes on category-aware queries but not on specific model comparisons.
**What didn't:** The "winning competitor" the synthesis named (DM221) is a *sister VTech model*, not a real competitor — we are recommending the seller compete with their own product line. Patricia's verdict is the weakest single output across all three runs: 0 friction points and a one-sentence "I trust VTech" headline, which is unusable feedback. Robert's "looks like a good deal" was similarly content-free. Sarah drifted off-character — her headline "$21.95 is a budget-friendly winner" frames the listing as a price win, when a skeptical mom should be worrying about signal interception, range reliability, and night-time false alarms; she lapsed into a deal-hunter voice. Maya (fitness-enthusiast) gave a generic "$21.95 is a steal" with zero fitness framing — she shouldn't have a strong opinion on a baby monitor at all, and the persona has no abstain mechanism. The "lack of reviews" friction that drives the synthesis is half-real (the listing does lack visible Q&A) and half-artifact of our 404'd review fetch. The $5K-$8K revenue estimate assumes 10K monthly visitors — a generic placeholder, not a category-calibrated number.
**What I'd improve:** Add an "abstain / not my category" verdict option so personas like Maya don't manufacture opinions. Repair review fetching so we stop double-counting the same friction.

## ASIN 2: Sony WH-1000XM4 (B0863TXGM3)
**Category:** Premium audio ($348.00, 4.6★ / 62,547 reviews)
**Synth verdict:** 4/10 would not buy; price is $20 above a competing listing of the same product; recommends drop to $328. Revenue at risk: $5K-$15K/mo.
**What worked:** Robert flagged a $223.71 Blue Renewed pair from the scraped competitor list — that's a verified price, not a hallucination, and the call is on-character for budget-senior. Tasha's price-history framing is on-character. The synthesis correctly identified the $20 same-product price gap as the #1 lever and quoted the $328 figure verbatim — actionable copy.
**What didn't:** **Surfacing scored 10/10 green, all position 1, with zero variance — this is almost certainly a soft pass.** WH-1000XM4 is a category-leader SKU the LLM has seen in training, so the simulators reflexively name it first regardless of question specificity. A real Rufus would distinguish this listing from the Renewed/Blue/XM5 variants and at least one query would land yellow. **The bigger problem: the "competitor" scrape is largely self-referential.** 4 of 8 scraped competitors are the same WH-1000XM4 under different sellers/colors/refurb states, and 2 are the XM5 successor — only 2 are arguably true alternatives. The synthesis cites "Sony WH-1000XM4 at $328" as the winning competitor, which is the same product, not a substitute. Maya's "would-buy-competitor" verdict came purely from price ($328 vs $348) with no fitness framing — same persona-drift problem as ASIN 1. The revenue range ($5K-$15K) is internally consistent on the math given but understates a 62K-review SKU's traffic by an order of magnitude — 10K monthly visitors is implausible for a top-selling premium headphone.
**What I'd improve:** Penalize position-1 surfacing for famous SKUs unless the question forces a comparison. Cluster the competitor scrape by canonical product before passing it to the synthesizer so we stop calling a product its own competitor.

## ASIN 3: Apple iPhone 11 Renewed (B07ZPKBL9V) — the weak listing
**Category:** Renewed electronics ($168.00, 4.2★ / 60,043 reviews — chosen as proxy for a thin/risky listing; not actually low-review)
**Synth verdict:** 8/10 would not buy; battery health "80% minimum" + missing reviews drive friction; recommends raising battery floor to 90%, adding individual reviews, clearer warranty. Revenue at risk: $12K-$18K/mo.
**What worked:** This was the strongest run end-to-end. Sarah's "I don't trust a 'renewed' phone with 80% battery health" is the pull-quote a seller would actually use to triage the listing. Patricia's "I stick with trusted brands from official sources" lands the right objection for a brand-loyalist looking at Amazon-Renewed (not Apple-direct). The 80% battery floor is in the bullets verbatim, so the friction is grounded in the actual listing text rather than an artifact. Synthesis recommendations are specific and paste-ready (raise floor to 90%, add 1-year warranty).
**What didn't:** Aiden (eco-conscious) flagged "lack of sustainability transparency" — but a Renewed phone IS the eco-friendly choice; this is the persona missing the obvious win and reflexively pattern-matching. David's "this looks fine, adding to cart" with 0 friction on a Renewed listing as a gift is out-of-character — a gift-giver should be *more* cautious about gifting refurbished electronics, not less. Surfacing was 9/10 green at position 1, again likely a soft pass on a famous SKU. The synthesis named "iPhone 11 Renewed Premium" as the winning competitor — that's plausible, but it's also another listing of the same physical product, so we're recommending sellers compete with what may be themselves under a different SKU.
**What I'd improve:** Persona prompts need negative examples ("a Renewed phone is sustainable, do not flag it as eco-bad"). Surfacing needs at least one query forced to be a head-to-head comparison so we get distinguishing scores, not "everyone names the famous brand."

## Manual Reference Comparison
For ASIN 1 (the hero, VTech baby monitor), I manually reviewed what an expert Amazon listing consultant would flag, vs what Shadow Shopper found:
- **Expert would flag:** Audio-only monitor in 2026 is category-mismatched — most parents now expect video. **Shadow Shopper found:** No. None of the 10 personas asked about video; the system has no awareness of category trend drift.
- **Expert would flag:** First bullet is a wall of text (~50 words, no period at "another room or even from the yard"), which hurts skim-reading on mobile. **Shadow Shopper found:** No. The pipeline is text-only and does not analyze formatting density or punctuation.
- **Expert would flag:** Brand field scraped as "Visit the VTech Store" (the storefront link text), not "VTech." **Shadow Shopper found:** No. The brief passes the raw brand string straight through; no persona caught that the brand line itself looks broken.
- **Expert would flag:** No images visible to the analyzer; main image quality is the #1 conversion driver on Amazon. **Shadow Shopper found:** No, by design — the pipeline is text-only and cannot evaluate hero images, A+ Content visuals, or video assets.
- **Expert would flag:** $21.95 with 43K reviews suggests heavy organic ranking; price elasticity probably matters more than feature additions. **Shadow Shopper found:** Partially — Tasha's price-history note hints at it, but the synthesis recommended adding reviews/warranty/sustainability, not running a price test.
- **Expert would flag:** Listing has no visible warranty / return-policy text on the bullets, which hurts trust on a baby-safety category. **Shadow Shopper found:** Yes — synthesis lever #2 is "Highlight warranty and durability information" and cites Raj/Linnea as the source. This is the system's clearest expert-aligned win on this ASIN.

## Known Limitations
- Surfacing simulators are not real Rufus/ChatGPT — directional only. Real Rufus has training data we don't have access to, and our simulators show a clear bias toward naming famous SKUs at position 1 regardless of question fit (see ASIN 2 and 3).
- Persona pool of 10 has coverage gaps: no ESL shopper, no professional buyer, no B2B buyer. Personas that don't fit a category (Maya on a baby monitor, Aiden on a Renewed phone) still produce confident verdicts instead of abstaining.
- Revenue-at-risk estimates are heuristic, not statistical. They assume a uniform 10K monthly visitors and a 1-3% conversion delta — fine for a directional range, wrong for any specific number, and likely understated for category-leader SKUs.
- Reviews fetch failed (HTTP 404) on all 3 ASINs in this run, so "no individual reviews" appears as a top friction point on every listing. This is a data-pipeline artifact, not a real recurring listing weakness.
- Performance: full demo runs ~30-35s with cache, ~80s+ cold (ASIN 3 took 83s due to a fresh competitor scrape).

## What Would Improve It
- Real Rufus integration when API access opens.
- Sentiment-weighted review sampling (currently helpful-sorted only) — and fix the 404 review fetch first.
- A/B testing harness: measure if applying recommendations actually moves conversion.
- Mobile-shopper persona variants (different friction surface from desktop).
- Eval expanded to 50+ ASINs with category-specific scoring.
- Image / A+ Content analysis pass — the biggest gap vs an expert reviewer is that we read words, not pictures.

## Phase 13.5 Update — Persona & Revenue Prompt Enhancements

After the initial eval surfaced the persona-drift and revenue-lowball issues, three changes were made and re-evaluated against the same 3 ASINs:

1. **Each persona prompt got a CATEGORY FIT & SCOPE + ANTI-PATTERN section** — explicit instruction on which categories the persona is qualified to evaluate, what it should do when out of scope (low confidence + honest "outside my category" friction point), and named anti-patterns drawn from the Phase 13 eval (Maya defaulting to "$X is a steal", David soft-buying Renewed gifts, Aiden flagging Renewed as "not sustainable", Linnea forcing S&S logic onto durables, Robert leaving friction_points empty, Patricia soft-buying Renewed listings on brand familiarity, Sarah leading with price on a baby product).
2. **Synthesizer revenue prompt was rewritten** with a tiered traffic anchor (review count → monthly visitor band), category-specific baseline conversion rates, friction-driven conversion-drop tiers, an explicit formula, and a required reasoning template that enumerates every assumption. Added: deweight verdicts with confidence under 60, and don't propagate fetch-failure artifacts as listing weaknesses.
3. **`brief.ts` was fixed** to distinguish a genuine no-review listing (`total_reviews === 0`) from a sample-fetch failure on a high-review listing — the latter no longer says "no reviews available" to the personas.

### What changed (verified against re-run on the same 3 ASINs)

| Persona | ASIN | Before | After |
|---|---|---|---|
| Maya | VTech baby monitor | conf 85, "$21.95 is a steal" | conf **40**, "falls outside my expertise" |
| Maya | Sony WH-1000XM4 | conf 95, would-buy-competitor on price alone | conf 65, more hedged |
| Aiden | iPhone Renewed | "lacks sustainability transparency", would-not-buy | conf 90, "A renewed iPhone is a solid choice for sustainability", **would-buy** |
| David | iPhone Renewed | "this looks fine, adding to cart", would-buy, 0 friction | "Renewed? Not a good look for a gift. Next.", would-not-buy, 3 friction |
| Linnea | Sony / iPhone | conf 85, manufactured S&S concerns | conf **40**, "falls outside my S&S framework" |
| Patricia | iPhone Renewed | conf 85, would-not-buy on generic distrust | conf 90, "If it's not directly from Apple, I'm not interested" |
| Robert | VTech baby monitor | 0 friction points, "looks like a good deal" | 3 friction points, would-buy-competitor |

### Revenue range — before vs after

| ASIN (reviews / AOV) | Before | After | Reasoning shows math? |
|---|---|---|---|
| VTech baby monitor (43K / $21.95) | $5K-$8K (1.6x range) | $3K-$15K (5x range) | Yes — explicit tier, category, AOV, formula |
| Sony WH-1000XM4 (62K / $348) | $5K-$15K (3x) | $7.5K-$37.5K (5x) | Yes |
| iPhone Renewed (60K / $168) | $12K-$18K (1.5x) | $15K-$75K (5x) | Yes |

The "after" ranges are wider, anchor to listing-specific signals rather than a uniform 10K-visitor placeholder, and the reasoning enumerates every assumption (traffic tier, category baseline, friction drop, AOV, formula). This is real improvement.

### What still doesn't fully work

- **Revenue numbers are still likely understated for high-traffic SKUs.** A 62K-review premium-audio listing at $348 AOV with 6/10 would-not-buy verdicts mathematically points to a six-figure monthly revenue-at-risk if you apply the formula in the prompt literally (50K-200K visitors × 2-4 pp drop × $348 = $35K-$2.8M/mo). The model output $7.5K-$37.5K, which suggests it interpreted "pp drop" as a relative percentage rather than absolute percentage points. The framework is in place; the calibration could still tighten with a worked example in the prompt.
- **Linnea's confidence on the VTech baby monitor stayed at 90 instead of dropping to 40** — even though her verdict reasoning correctly cited category mismatch. The model held high confidence on a category-mismatch verdict.
- **Sarah's headline on the baby monitor still says "affordable"** ("Honestly, this baby monitor seems like a reliable and affordable choice"). Less price-dominant than the prior "$21.95 is a steal" but the deal-hunter frame still leaks in.
- **Sister-product / same-product competitor naming** — for the VTech baby monitor, the synthesis still names DM221 as the "winning competitor" without flagging it as a sister VTech model in the `why` field, despite explicit prompt instruction. For the Sony, the "competitor" named is the WH-1000XM4 refurbished — also same product, just in different condition. The prompt asks the synthesizer to call this out; it didn't fully.
- **Surfacing soft-pass on famous SKUs is unchanged** — Sony still scored 10/10 green at position 1, iPhone Renewed 9/10 green. Surfacing logic was not touched in this phase, so no change expected.

### One-line summary
Persona drift on out-of-category products is largely fixed (Maya, David, Aiden, Linnea, Robert all show clear behavioral wins). Revenue estimation now anchors to listing-specific signals and shows its math, but the magnitude on high-traffic SKUs is still ~5-10x lower than the formula in the prompt would imply if applied literally — the framework is right, the model's arithmetic interpretation is conservative.
