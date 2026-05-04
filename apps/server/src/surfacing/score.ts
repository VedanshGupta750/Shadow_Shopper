import type { SurfacingScore } from "../llm/types.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "these", "those",
  "your", "our", "their", "his", "her", "its",
  "are", "was", "were", "have", "has", "had", "will", "would", "could", "should",
  "what", "when", "where", "why", "how",
  "all", "any", "but", "one", "two", "you",
  "into", "onto", "upon", "out",
  "amazon", "renewed", "refurbished",
]);

/**
 * Tokenize a string for fuzzy comparison.
 * Lowercases, strips non-alphanumeric, drops stopwords and tokens shorter than 3 chars.
 *
 * NOTE: This is an imperfect heuristic. It will misfire on:
 * - Brand names that ARE stopwords ("WITH" mounting kit) — vanishingly rare in our domain.
 * - Models distinguished only by short codes ("M1" vs "M2") — both filtered as too short.
 * - Same brand, different SKU ("AirPods Pro" vs "AirPods Max") — overlap likely > 60%.
 * The 60% threshold is tuned for product titles where overlap of major nouns is expected.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

/**
 * Token-overlap ratio = |A ∩ B| / min(|A|, |B|).
 * Symmetric in the sense that order of args doesn't matter.
 * Returns 0 when either set is empty.
 */
export function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let count = 0;
  for (const t of a) if (b.has(t)) count++;
  return count / Math.min(a.size, b.size);
}

/** Match threshold: 60% of the smaller token set must be shared. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Find the 1-based position of the target in mentionedProducts.
 * Returns null if no mention scores at or above MATCH_THRESHOLD.
 *
 * Fuzzy heuristic: "Apple iPad Air 5th Gen 64GB Pink" matches "iPad Air".
 * Limitations: see tokenize() docstring.
 */
export function findTargetPosition(targetTitle: string, mentionedProducts: string[]): number | null {
  const targetTokens = tokenize(targetTitle);
  if (targetTokens.size === 0) return null;

  for (let i = 0; i < mentionedProducts.length; i++) {
    const productTokens = tokenize(mentionedProducts[i] ?? "");
    if (overlapRatio(targetTokens, productTokens) >= MATCH_THRESHOLD) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Bucket a position into a traffic-light score.
 *   1            → green
 *   2 or 3       → yellow
 *   4+           → yellow (still mentioned, just buried)
 *   not mentioned → red
 */
export function bucketScore(position: number | null): SurfacingScore {
  if (position === null) return "red";
  if (position === 1) return "green";
  return "yellow";
}

/** Compute the full score result for one cell. targetAsin reserved for future use. */
export function scoreSurfacing(
  _targetAsin: string,
  targetTitle: string,
  mentionedProducts: string[],
): { mentioned_target: boolean; mentioned_position: number | null; score: SurfacingScore } {
  const position = findTargetPosition(targetTitle, mentionedProducts);
  return {
    mentioned_target: position !== null,
    mentioned_position: position,
    score: bucketScore(position),
  };
}
