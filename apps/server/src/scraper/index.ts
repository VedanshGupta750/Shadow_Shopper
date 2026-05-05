import { cached } from "./cache.js";
import { getProduct, getReviews, searchAmazon } from "./scraperapi.js";
import { DEFAULT_MARKETPLACE, type Marketplace } from "./url.js";
import type { AmazonProduct, AmazonReview, AmazonSearchResult } from "../types/amazon.js";

export { extractAsin, parseAmazonUrl, DEFAULT_MARKETPLACE } from "./url.js";
export type { Marketplace } from "./url.js";
export { clearCache, getCacheStats } from "./cache.js";
export { getProduct, getReviews, searchAmazon };

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/**
 * Marketplace-aware cache key. We include the TLD so the same ASIN scraped from
 * different marketplaces (amazon.com vs amazon.in) doesn't collide on cache.
 */
function mpKey(marketplace: Marketplace): string {
  return `${marketplace.country}.${marketplace.tld}`;
}

/** Fetch product details with a 7-day filesystem cache. */
export function getProductCached(
  asin: string,
  marketplace: Marketplace = DEFAULT_MARKETPLACE,
): Promise<AmazonProduct> {
  return cached(
    `product:${mpKey(marketplace)}:${asin}`,
    SEVEN_DAYS,
    () => getProduct(asin, marketplace),
  );
}

/** Fetch reviews with a 7-day filesystem cache. Cache key includes max count. */
export function getReviewsCached(
  asin: string,
  max: number = 10,
  marketplace: Marketplace = DEFAULT_MARKETPLACE,
): Promise<AmazonReview[]> {
  return cached(
    `reviews:${mpKey(marketplace)}:${asin}:${max}`,
    SEVEN_DAYS,
    () => getReviews(asin, max, marketplace),
  );
}

/** Search Amazon with a 7-day filesystem cache. Cache key includes query and limit. */
export function searchAmazonCached(
  query: string,
  limit: number = 10,
  marketplace: Marketplace = DEFAULT_MARKETPLACE,
): Promise<AmazonSearchResult[]> {
  return cached(
    `search:${mpKey(marketplace)}:${query}:${limit}`,
    SEVEN_DAYS,
    () => searchAmazon(query, limit, marketplace),
  );
}
