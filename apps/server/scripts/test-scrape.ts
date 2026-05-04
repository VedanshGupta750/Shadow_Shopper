import { getProductCached, getReviewsCached, searchAmazonCached, getCacheStats } from "../src/scraper/index.js";

const asin = process.argv[2];
if (!asin) {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/test-scrape.ts <ASIN>");
  process.exit(1);
}

async function main() {
  // eslint-disable-next-line no-console
  const log = console.log.bind(console);

  const statsBefore = getCacheStats();

  log(`\n=== Shadow Shopper — Test Scrape ===`);
  log(`ASIN: ${asin}`);
  log(`Cache entries before: ${statsBefore.count}\n`);

  log("--- Product ---");
  let productName = asin;
  try {
    const product = await getProductCached(asin);
    productName = product.name;
    log(`  Title:   ${product.name}`);
    log(`  Brand:   ${product.brand}`);
    log(`  Price:   ${product.price_string}`);
    log(`  Rating:  ${product.rating ?? "N/A"}`);
    log(`  Reviews: ${product.total_reviews ?? "N/A"}`);
    log(`  Bullets: ${product.bullets.length}`);
    log(`  Images:  ${product.images.length}`);
    log(`  In stock: ${product.in_stock ?? "unknown"}`);
  } catch (err) {
    log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }

  log("\n--- Reviews ---");
  try {
    const reviews = await getReviewsCached(asin, 5);
    log(`  Fetched: ${reviews.length} reviews`);
    for (const r of reviews.slice(0, 3)) {
      log(`  [${r.rating}★] ${r.title} — ${r.reviewer_name}${r.verified_purchase ? " ✓" : ""}`);
    }
  } catch (err) {
    log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }

  log("\n--- Competitor Search ---");
  try {
    const query = productName.split(" ").slice(0, 4).join(" ");
    log(`  Query: "${query}"`);
    const competitors = await searchAmazonCached(query, 10);
    log(`  Results: ${competitors.length} products`);
    for (const c of competitors.slice(0, 5)) {
      log(`  - ${c.asin}: ${c.title.slice(0, 60)}... (${c.price_string ?? "no price"})`);
    }
  } catch (err) {
    log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }

  const statsAfter = getCacheStats();
  log(`\nCache entries after: ${statsAfter.count} (${statsAfter.totalBytes} bytes)`);
  log("=== Done ===\n");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Test scrape failed:", err);
  process.exit(1);
});
