import type { AmazonProduct, AmazonReview, AmazonSearchResult } from "../types/amazon.js";

/**
 * Interleave low-rated (1-3 stars) and high-rated (4-5 stars) reviews
 * to give the persona a balanced view. Returns up to `max` reviews.
 */
function mixReviews(reviews: AmazonReview[], max: number = 10): AmazonReview[] {
  const low = reviews.filter((r) => r.rating <= 3);
  const high = reviews.filter((r) => r.rating >= 4);
  const mixed: AmazonReview[] = [];
  let li = 0;
  let hi = 0;

  while (mixed.length < max) {
    const hasLow = li < low.length;
    const hasHigh = hi < high.length;
    if (!hasLow && !hasHigh) break;

    if (hasLow) {
      mixed.push(low[li]!);
      li++;
    }
    if (mixed.length < max && hasHigh) {
      mixed.push(high[hi]!);
      hi++;
    }
  }

  return mixed;
}

/** Build a product brief from scraped data. Targets under 4000 tokens. */
export function buildBrief(
  product: AmazonProduct,
  reviews: AmazonReview[],
  competitors: AmazonSearchResult[],
): string {
  const lines: string[] = [];

  lines.push("# PRODUCT BRIEF");
  lines.push("");
  lines.push("## Product");
  lines.push(`Name: ${product.name}`);
  lines.push(`Brand: ${product.brand}`);
  lines.push(`Price: ${product.price_string}`);
  lines.push(
    `Rating: ${product.rating != null ? `${product.rating}/5` : "N/A"} (${product.total_reviews ?? 0} reviews)`,
  );
  lines.push(`In Stock: ${product.in_stock != null ? (product.in_stock ? "Yes" : "No") : "Unknown"}`);

  if (product.bullets.length > 0) {
    lines.push("");
    lines.push("## Key Features");
    for (const bullet of product.bullets.slice(0, 8)) {
      lines.push(`- ${bullet.slice(0, 200)}`);
    }
  }

  if (product.description) {
    lines.push("");
    lines.push("## Description");
    lines.push(product.description.slice(0, 800));
  }

  if (product.features && Object.keys(product.features).length > 0) {
    lines.push("");
    lines.push("## Product Details");
    const entries = Object.entries(product.features).slice(0, 10);
    for (const [key, value] of entries) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  const mixed = mixReviews(reviews, 10);
  const totalReviews = product.total_reviews ?? 0;
  if (mixed.length > 0) {
    lines.push("");
    lines.push("## Customer Reviews (sample, mixed high/low)");
    for (const review of mixed) {
      const verified = review.verified_purchase ? " [Verified]" : "";
      const body = review.body.slice(0, 200);
      lines.push(`[${review.rating}★${verified}] "${review.title}": ${body}`);
    }
  } else if (totalReviews > 0) {
    // The listing HAS reviews (per the aggregate count above), we just couldn't fetch sample text.
    // Personas should NOT cite "no reviews available" as friction — that would be a data-pipeline
    // artifact, not a real listing weakness.
    lines.push("");
    lines.push("## Customer Reviews");
    lines.push(
      `Review samples are not included in this brief, but the listing has ${totalReviews} reviews with an aggregate rating of ${product.rating ?? "N/A"}/5 (shown above). Do NOT cite "no reviews" as a listing weakness — the reviews exist on the live page, only the sample text was unavailable to this brief.`,
    );
  } else {
    lines.push("");
    lines.push("## Customer Reviews");
    lines.push(
      "No reviews on this listing — this is a new, low-traffic, or thin listing. Treat this as a real friction point: shoppers cannot validate quality from peer feedback.",
    );
  }

  if (competitors.length > 0) {
    lines.push("");
    lines.push("## Competitor Alternatives");
    for (const comp of competitors.slice(0, 6)) {
      const price = comp.price_string ?? "no price listed";
      const rating = comp.rating != null ? `${comp.rating}★` : "no rating";
      const reviewCount = comp.total_reviews != null ? `${comp.total_reviews} reviews` : "";
      lines.push(`- ${comp.title.slice(0, 80)} | ${price} | ${rating} ${reviewCount}`.trimEnd());
    }
  } else {
    lines.push("");
    lines.push("## Competitor Alternatives");
    lines.push("No competitor data available. Evaluate this product on its own merits.");
  }

  lines.push("");
  lines.push("---");
  lines.push("Analyze this product from your persona's perspective. Return your structured verdict.");

  return lines.join("\n");
}
