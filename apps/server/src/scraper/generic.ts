import axios from "axios";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { UpstreamError } from "../errors.js";
import type { AmazonProduct } from "../types/amazon.js";

/**
 * Generic e-commerce scraper for non-Amazon URLs (Flipkart, Meesho, Myntra,
 * Nykaa, AJIO, anything else with a product page).
 *
 * Strategy:
 *  1. Fetch the raw rendered HTML via ScraperAPI's general-purpose endpoint.
 *  2. Parse <script type="application/ld+json"> for schema.org Product nodes.
 *     Most modern e-commerce sites publish this for SEO; if present we get
 *     name, brand, description, image, offers.price, aggregateRating without
 *     touching DOM selectors that change every release.
 *  3. Fall back to OpenGraph and product:* meta tags.
 *  4. Return an AmazonProduct-shaped object so the rest of the pipeline (brief
 *     builder, personas, synthesizer) doesn't need to know the source.
 *
 * What we DON'T support on generic:
 *  - Reviews (no standard JSON-LD field for review bodies on most pages)
 *  - Competitor search (no per-platform search API)
 *  - The pipeline runs against thinner data; brief.ts handles empty reviews
 *    and competitors; personas degrade to lower confidence.
 */

const RAW_BASE = "https://api.scraperapi.com/";
const TIMEOUT_MS = 70_000;

export async function scrapeGenericProduct(
  url: string,
  syntheticAsin: string,
): Promise<AmazonProduct> {
  logger.debug({ url }, "scraper.generic: start");

  let html: string;
  try {
    const res = await axios.get(RAW_BASE, {
      params: {
        api_key: env.SCRAPERAPI_KEY,
        url,
        render: "true", // SPA rendering — Flipkart/Meesho/Myntra need JS
        country_code: "in",
      },
      timeout: TIMEOUT_MS,
      // ScraperAPI returns the page HTML as the response body
      responseType: "text",
      transformResponse: [(d) => d],
    });
    html = String(res.data ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ url, err: message }, "scraper.generic: fetch failed");
    throw new UpstreamError(
      `Couldn't load ${url}. The site may be blocking scrapers or the URL is unreachable.`,
    );
  }

  if (html.length < 500) {
    throw new UpstreamError(
      `Got near-empty HTML from ${url} (${html.length} bytes). The site likely blocked the scrape.`,
    );
  }

  const product = extractProduct(html, url, syntheticAsin);
  if (!product.name || product.name === "Unknown product") {
    logger.warn(
      { url, htmlChars: html.length },
      "scraper.generic: could not find Product JSON-LD or OpenGraph metadata",
    );
    throw new UpstreamError(
      `Could not extract product info from ${url}. The page didn't expose schema.org/Product JSON-LD or OpenGraph metadata. This usually means the page is a category/search page rather than a product page, or the site blocks structured-data extraction.`,
    );
  }

  logger.info(
    { url, name: product.name.slice(0, 60), brand: product.brand, bullets: product.bullets.length },
    "scraper.generic: success",
  );
  return product;
}

// ============================================================================
// HTML parsing helpers (regex-based — keeps deps light, scope narrow)
// ============================================================================

interface ProductCandidate {
  name?: string;
  brand?: string;
  description?: string;
  image?: string;
  price?: string;
  rating?: number;
  totalReviews?: number;
  bullets?: string[];
}

function extractProduct(
  html: string,
  url: string,
  syntheticAsin: string,
): AmazonProduct {
  const fromJsonLd = extractFromJsonLd(html);
  const fromOg = extractFromOpenGraph(html);

  // Merge — JSON-LD wins where both have a value, OG fills gaps. Use conditional
  // spreads to keep exactOptionalPropertyTypes happy.
  const name = fromJsonLd.name ?? fromOg.name;
  const brand = fromJsonLd.brand ?? fromOg.brand;
  const description = fromJsonLd.description ?? fromOg.description;
  const image = fromJsonLd.image ?? fromOg.image;
  const price = fromJsonLd.price ?? fromOg.price;
  const merged: ProductCandidate = {
    bullets: fromJsonLd.bullets ?? [],
    ...(name != null ? { name } : {}),
    ...(brand != null ? { brand } : {}),
    ...(description != null ? { description } : {}),
    ...(image != null ? { image } : {}),
    ...(price != null ? { price } : {}),
    ...(fromJsonLd.rating != null ? { rating: fromJsonLd.rating } : {}),
    ...(fromJsonLd.totalReviews != null ? { totalReviews: fromJsonLd.totalReviews } : {}),
  };

  return {
    asin: syntheticAsin,
    name: merged.name ?? "Unknown product",
    brand: merged.brand ?? extractHostnameAsBrand(url),
    price_string: merged.price ?? "N/A",
    bullets: merged.bullets ?? [],
    images: merged.image ? [merged.image] : [],
    ...(merged.rating != null ? { rating: merged.rating } : {}),
    ...(merged.totalReviews != null ? { total_reviews: merged.totalReviews } : {}),
    ...(merged.description ? { description: merged.description } : {}),
  };
}

function extractHostnameAsBrand(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^(?:www|smile)\./, "");
    // "flipkart.com" -> "Flipkart"
    const root = h.split(".")[0] ?? h;
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return "Unknown";
  }
}

// ----------------------------------------------------------------------------
// JSON-LD: <script type="application/ld+json">{...}</script>
// ----------------------------------------------------------------------------

const JSON_LD_RE =
  /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractFromJsonLd(html: string): ProductCandidate {
  const candidates: ProductCandidate[] = [];

  for (const match of html.matchAll(JSON_LD_RE)) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Some sites embed multiple JSON objects in one script tag; skip on parse fail.
      continue;
    }
    walkForProduct(parsed, candidates);
  }

  // Pick the candidate with the most populated fields.
  if (candidates.length === 0) return {};
  candidates.sort(
    (a, b) => Object.keys(populatedFields(b)).length - Object.keys(populatedFields(a)).length,
  );
  return candidates[0]!;
}

function populatedFields(c: ProductCandidate): Partial<ProductCandidate> {
  const out: Partial<ProductCandidate> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v == null) continue;
    if (typeof v === "string" && v.length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Recursively walk JSON-LD tree, collecting any node with @type containing "Product". */
function walkForProduct(node: unknown, out: ProductCandidate[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkForProduct(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const isProduct =
    (typeof type === "string" && type.toLowerCase().includes("product")) ||
    (Array.isArray(type) && type.some((t) => typeof t === "string" && t.toLowerCase().includes("product")));

  if (isProduct) {
    const candidate: ProductCandidate = {};
    if (typeof obj["name"] === "string") candidate.name = obj["name"];
    const brand = parseBrand(obj["brand"]);
    if (brand) candidate.brand = brand;
    if (typeof obj["description"] === "string") candidate.description = obj["description"].slice(0, 1000);
    const image = parseImage(obj["image"]);
    if (image) candidate.image = image;
    const price = parsePrice(obj["offers"]);
    if (price) candidate.price = price;
    const rating = parseRating(obj["aggregateRating"]);
    if (rating.rating != null) candidate.rating = rating.rating;
    if (rating.totalReviews != null) candidate.totalReviews = rating.totalReviews;
    candidate.bullets = parseBullets(obj);
    out.push(candidate);
  }

  // Recurse into common container fields
  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const v = obj[key];
    if (v != null) walkForProduct(v, out);
  }
}

function parseBrand(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const b = v as Record<string, unknown>;
    if (typeof b["name"] === "string") return b["name"];
  }
  return undefined;
}

function parseImage(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  if (v && typeof v === "object") {
    const img = v as Record<string, unknown>;
    if (typeof img["url"] === "string") return img["url"];
    if (typeof img["contentUrl"] === "string") return img["contentUrl"];
  }
  return undefined;
}

function parsePrice(offers: unknown): string | undefined {
  if (!offers) return undefined;
  // offers can be a single Offer object, an array of Offers, or an AggregateOffer
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const obj = o as Record<string, unknown>;
    const price = obj["price"] ?? obj["lowPrice"];
    if (price == null) continue;
    const currency = typeof obj["priceCurrency"] === "string" ? obj["priceCurrency"] : "";
    const sym = currencySymbol(currency);
    const num = typeof price === "number" ? price : typeof price === "string" ? price : null;
    if (num != null) return `${sym}${num}`;
  }
  return undefined;
}

function currencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case "USD":
      return "$";
    case "INR":
      return "₹";
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    case "JPY":
      return "¥";
    case "":
      return "";
    default:
      return `${code} `;
  }
}

function parseRating(
  v: unknown,
): { rating: number | undefined; totalReviews: number | undefined } {
  const out: { rating: number | undefined; totalReviews: number | undefined } = {
    rating: undefined,
    totalReviews: undefined,
  };
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  const obj = v as Record<string, unknown>;
  const ratingValue = obj["ratingValue"];
  if (typeof ratingValue === "number") out.rating = ratingValue;
  else if (typeof ratingValue === "string" && !isNaN(Number(ratingValue))) {
    out.rating = Number(ratingValue);
  }
  const count = obj["reviewCount"] ?? obj["ratingCount"];
  if (typeof count === "number") out.totalReviews = count;
  else if (typeof count === "string" && !isNaN(Number(count))) {
    out.totalReviews = Number(count);
  }
  return out;
}

/**
 * Bullets aren't a standard schema.org Product field, but some sites stuff them
 * into description (\\n-separated) or a custom property. Try a few heuristics.
 */
function parseBullets(obj: Record<string, unknown>): string[] {
  // Sometimes vendors put bullets in additionalProperty[].value
  const additional = obj["additionalProperty"];
  if (Array.isArray(additional)) {
    const out: string[] = [];
    for (const a of additional) {
      if (a && typeof a === "object") {
        const ap = a as Record<string, unknown>;
        if (typeof ap["value"] === "string") out.push(ap["value"].slice(0, 200));
      }
    }
    if (out.length > 0) return out.slice(0, 8);
  }
  // Description split on newlines, if it looks like bullets
  const desc = obj["description"];
  if (typeof desc === "string" && desc.includes("\n")) {
    const lines = desc
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && l.length < 200);
    if (lines.length >= 2) return lines.slice(0, 8);
  }
  return [];
}

// ----------------------------------------------------------------------------
// OpenGraph fallback: <meta property="og:..." content="...">
// ----------------------------------------------------------------------------

const META_RE =
  /<meta\s+(?:[^>]*\s)?(?:property|name)\s*=\s*["']([^"']+)["']\s+(?:[^>]*\s)?content\s*=\s*["']([^"']*)["'][^>]*>/gi;

function extractFromOpenGraph(html: string): ProductCandidate {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(META_RE)) {
    const key = (m[1] ?? "").toLowerCase();
    const value = (m[2] ?? "").trim();
    if (key && value && !meta[key]) meta[key] = value;
  }

  const name = meta["og:title"] ?? meta["twitter:title"] ?? meta["title"];
  const description = meta["og:description"] ?? meta["twitter:description"] ?? meta["description"];
  const image = meta["og:image"] ?? meta["twitter:image"];
  const brand = meta["og:brand"] ?? meta["product:brand"];

  const priceAmount =
    meta["og:price:amount"] ?? meta["product:price:amount"] ?? meta["product:sale_price:amount"];
  const priceCurrency =
    meta["og:price:currency"] ?? meta["product:price:currency"] ?? meta["product:sale_price:currency"];
  const price =
    priceAmount != null && priceAmount.length > 0
      ? `${currencySymbol(priceCurrency ?? "")}${priceAmount}`
      : undefined;

  const out: ProductCandidate = {};
  if (name) out.name = name;
  if (description) out.description = description.slice(0, 1000);
  if (image) out.image = image;
  if (brand) out.brand = brand;
  if (price) out.price = price;
  return out;
}
