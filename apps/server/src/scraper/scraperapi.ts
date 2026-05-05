import axios, { type AxiosInstance } from "axios";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import { z } from "zod";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { ValidationError, UpstreamError } from "../errors.js";
import { DEFAULT_MARKETPLACE, type Marketplace } from "./url.js";
import type { AmazonProduct, AmazonReview, AmazonSearchResult } from "../types/amazon.js";

const ASIN_RE = /^[A-Z0-9]{10}$/;

const limit = pLimit(5);

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: "https://api.scraperapi.com/structured/amazon",
    timeout: 70_000,
    params: {
      api_key: env.SCRAPERAPI_KEY,
    },
  });
}

let _client: AxiosInstance | undefined;
function getClient(): AxiosInstance {
  if (!_client) _client = createClient();
  return _client;
}

function isRetryable(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) return true;
    return error.response.status >= 500;
  }
  return false;
}

/**
 * Pino's default error serializer dumps every enumerable property on an
 * AxiosError — config, request, response, agent, sockets — producing hundreds
 * of lines of internals per failure. This trims to what's actionable.
 */
function summarizeError(error: unknown): Record<string, unknown> {
  if (axios.isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (error) {
        if (!isRetryable(error)) throw new AbortError(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },
    { retries: 2, factor: 2, minTimeout: 800 },
  );
}

// -- Zod schemas for raw ScraperAPI responses --

const rawProductSchema = z
  .object({
    name: z.string(),
    brand: z.string().default("Unknown"),
    pricing: z.string().optional(),
    list_price: z.string().optional(),
    average_rating: z.number().optional(),
    total_reviews: z.number().optional(),
    feature_bullets: z.array(z.string()).default([]),
    full_description: z.string().optional(),
    images: z.array(z.string()).default([]),
    // ScraperAPI returns mixed types here per product (string, array, nested object). Accept anything;
    // the mapper flattens to Record<string,string> defensively below.
    product_information: z.record(z.string(), z.unknown()).optional(),
    availability_status: z.string().optional(),
  })
  .passthrough();

const rawReviewSchema = z
  .object({
    id: z.string(),
    title: z.string().default(""),
    body: z.string().default(""),
    rating: z.number(),
    profile: z
      .object({ name: z.string().default("Anonymous") })
      .passthrough()
      .default({ name: "Anonymous" }),
    verified_purchase: z.boolean().default(false),
    date: z
      .object({ date: z.string().optional(), unix: z.number().optional() })
      .passthrough()
      .optional(),
    helpful_votes: z.number().optional(),
  })
  .passthrough();

const rawReviewsResponseSchema = z
  .object({
    reviews: z.array(rawReviewSchema).default([]),
  })
  .passthrough();

const rawSearchItemSchema = z
  .object({
    type: z.string().optional(),
    asin: z.string(),
    name: z.string().default(""),
    url: z.string().default(""),
    price_string: z.string().optional(),
    image: z.string().optional(),
    stars: z.number().optional(),
    total_reviews: z.number().optional(),
  })
  .passthrough();

const rawSearchResponseSchema = z
  .object({
    results: z.array(rawSearchItemSchema).default([]),
  })
  .passthrough();

// -- Mappers --

/**
 * ScraperAPI's product_information field can contain strings, numbers, arrays of strings,
 * or nested objects depending on the listing. Flatten to Record<string, string> by:
 * - keeping primitives as their string form
 * - joining arrays of primitives with ", "
 * - dropping nested objects (rare; e.g. customer_reviews { stars, count } is redundant with top-level fields)
 */
function flattenProductInformation(
  raw: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    } else if (Array.isArray(v)) {
      const items = v.filter(
        (x): x is string | number => typeof x === "string" || typeof x === "number",
      );
      if (items.length > 0) out[k] = items.join(", ");
    }
    // intentionally skip nested objects/null
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapProduct(asin: string, raw: z.infer<typeof rawProductSchema>): AmazonProduct {
  const features = flattenProductInformation(raw.product_information);
  return {
    asin,
    name: raw.name,
    brand: raw.brand,
    price_string: raw.pricing ?? raw.list_price ?? "N/A",
    bullets: raw.feature_bullets,
    images: raw.images,
    ...(raw.average_rating != null ? { rating: raw.average_rating } : {}),
    ...(raw.total_reviews != null ? { total_reviews: raw.total_reviews } : {}),
    ...(raw.full_description ? { description: raw.full_description } : {}),
    ...(features ? { features } : {}),
    ...(raw.availability_status != null
      ? { in_stock: raw.availability_status.toLowerCase().includes("in stock") }
      : {}),
  };
}

function mapReview(raw: z.infer<typeof rawReviewSchema>): AmazonReview {
  return {
    id: raw.id,
    title: raw.title,
    body: raw.body,
    rating: raw.rating,
    reviewer_name: raw.profile.name,
    verified_purchase: raw.verified_purchase,
    ...(raw.date?.date ? { date_iso: raw.date.date } : {}),
    ...(raw.helpful_votes != null ? { helpful_votes: raw.helpful_votes } : {}),
  };
}

function mapSearchResult(raw: z.infer<typeof rawSearchItemSchema>): AmazonSearchResult {
  return {
    asin: raw.asin,
    title: raw.name,
    url: raw.url,
    ...(raw.price_string ? { price_string: raw.price_string } : {}),
    ...(raw.image ? { image: raw.image } : {}),
    ...(raw.stars != null ? { rating: raw.stars } : {}),
    ...(raw.total_reviews != null ? { total_reviews: raw.total_reviews } : {}),
  };
}

// -- Public API --

/** Fetch a product's detail page by ASIN via ScraperAPI structured endpoint. */
export async function getProduct(
  asin: string,
  marketplace: Marketplace = DEFAULT_MARKETPLACE,
): Promise<AmazonProduct> {
  if (!ASIN_RE.test(asin)) {
    throw new ValidationError(`Invalid ASIN format: "${asin}". Must be 10 alphanumeric characters.`);
  }

  logger.debug({ asin, ...marketplace }, "scraper.getProduct: start");

  try {
    const data: unknown = await limit(() =>
      withRetry(async () => {
        const res = await getClient().get("/product", {
          params: { asin, country_code: marketplace.country, tld: marketplace.tld },
        });
        return res.data as unknown;
      }),
    );

    const parsed = rawProductSchema.parse(data);
    const product = mapProduct(asin, parsed);

    logger.info(
      { asin, ...marketplace, name: product.name, reviews: product.total_reviews },
      "scraper.getProduct: success",
    );
    return product;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error({ asin, ...marketplace, err: summarizeError(error) }, "scraper.getProduct: failed");
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new UpstreamError(
        `Couldn't load that Amazon listing (ASIN ${asin} on amazon.${marketplace.tld}). The product may be unavailable, region-locked, or not indexed by ScraperAPI. Try a different URL.`,
      );
    }
    throw new UpstreamError(`ScraperAPI product fetch failed for ASIN ${asin} on amazon.${marketplace.tld}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Fetch customer reviews for an ASIN. Returns up to `max` reviews. */
export async function getReviews(
  asin: string,
  max: number = 10,
  marketplace: Marketplace = DEFAULT_MARKETPLACE,
): Promise<AmazonReview[]> {
  if (!ASIN_RE.test(asin)) {
    throw new ValidationError(`Invalid ASIN format: "${asin}". Must be 10 alphanumeric characters.`);
  }

  logger.debug({ asin, max, ...marketplace }, "scraper.getReviews: start");

  try {
    const pagesNeeded = Math.ceil(max / 10);
    const pages = Array.from({ length: pagesNeeded }, (_, i) => i + 1);

    const results = await Promise.all(
      pages.map((page) =>
        limit(() =>
          withRetry(async () => {
            const res = await getClient().get("/review", {
              params: { asin, page, country_code: marketplace.country, tld: marketplace.tld },
            });
            return res.data as unknown;
          }),
        ),
      ),
    );

    const reviews: AmazonReview[] = [];
    for (const data of results) {
      const parsed = rawReviewsResponseSchema.parse(data);
      reviews.push(...parsed.reviews.map(mapReview));
    }

    const sliced = reviews.slice(0, max);
    logger.info(
      { asin, ...marketplace, fetched: sliced.length, pagesQueried: pagesNeeded },
      "scraper.getReviews: success",
    );
    return sliced;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error({ asin, ...marketplace, err: summarizeError(error) }, "scraper.getReviews: failed");
    throw new UpstreamError(`ScraperAPI review fetch failed for ASIN ${asin} on amazon.${marketplace.tld}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Search Amazon for products matching a query. Returns up to `limit` results. */
export async function searchAmazon(
  query: string,
  resultLimit: number = 10,
  marketplace: Marketplace = DEFAULT_MARKETPLACE,
): Promise<AmazonSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("Search query must be non-empty.");
  }

  logger.debug({ query: trimmed, resultLimit, ...marketplace }, "scraper.searchAmazon: start");

  try {
    const data: unknown = await limit(() =>
      withRetry(async () => {
        const res = await getClient().get("/search", {
          params: { query: trimmed, country_code: marketplace.country, tld: marketplace.tld },
        });
        return res.data as unknown;
      }),
    );

    const parsed = rawSearchResponseSchema.parse(data);
    const items = parsed.results
      .filter((r) => r.type === "search_product" || !r.type)
      .slice(0, resultLimit)
      .map(mapSearchResult);

    logger.info({ query: trimmed, ...marketplace, count: items.length }, "scraper.searchAmazon: success");
    return items;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error({ query: trimmed, ...marketplace, err: summarizeError(error) }, "scraper.searchAmazon: failed");
    throw new UpstreamError(`ScraperAPI search failed for query "${trimmed}" on amazon.${marketplace.tld}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
