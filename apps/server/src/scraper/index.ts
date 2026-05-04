import { cached } from "./cache.js";
import { getProduct, getReviews, searchAmazon } from "./scraperapi.js";
import type { AmazonProduct, AmazonReview, AmazonSearchResult } from "../types/amazon.js";

export { extractAsin } from "./url.js";
export { clearCache, getCacheStats } from "./cache.js";
export { getProduct, getReviews, searchAmazon };

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/** Fetch product details with a 7-day filesystem cache. */
export function getProductCached(asin: string): Promise<AmazonProduct> {
  return cached(`product:${asin}`, SEVEN_DAYS, () => getProduct(asin));
}

/** Fetch reviews with a 7-day filesystem cache. Cache key includes max count. */
export function getReviewsCached(asin: string, max: number = 10): Promise<AmazonReview[]> {
  return cached(`reviews:${asin}:${max}`, SEVEN_DAYS, () => getReviews(asin, max));
}

/** Search Amazon with a 7-day filesystem cache. Cache key includes query and limit. */
export function searchAmazonCached(query: string, limit: number = 10): Promise<AmazonSearchResult[]> {
  return cached(`search:${query}:${limit}`, SEVEN_DAYS, () => searchAmazon(query, limit));
}
