/**
 * Amazon marketplace metadata. ScraperAPI's structured Amazon endpoint accepts
 * `country_code` and `tld` query params; we derive both from the URL hostname.
 */
export interface Marketplace {
  /** ScraperAPI country code (e.g. "us", "in", "gb"). */
  country: string;
  /** Amazon TLD (e.g. "com", "in", "co.uk"). */
  tld: string;
}

export const DEFAULT_MARKETPLACE: Marketplace = { country: "us", tld: "com" };

/** Hostname → marketplace. Hostname is normalized (lowercased, www/smile stripped). */
const MARKETPLACES: Record<string, Marketplace> = {
  "amazon.com": { country: "us", tld: "com" },
  "amazon.co.uk": { country: "gb", tld: "co.uk" },
  "amazon.de": { country: "de", tld: "de" },
  "amazon.fr": { country: "fr", tld: "fr" },
  "amazon.it": { country: "it", tld: "it" },
  "amazon.es": { country: "es", tld: "es" },
  "amazon.ca": { country: "ca", tld: "ca" },
  "amazon.com.mx": { country: "mx", tld: "com.mx" },
  "amazon.com.br": { country: "br", tld: "com.br" },
  "amazon.com.au": { country: "au", tld: "com.au" },
  "amazon.co.jp": { country: "jp", tld: "co.jp" },
  "amazon.in": { country: "in", tld: "in" },
  "amazon.nl": { country: "nl", tld: "nl" },
  "amazon.se": { country: "se", tld: "se" },
  "amazon.pl": { country: "pl", tld: "pl" },
  "amazon.sa": { country: "sa", tld: "sa" },
  "amazon.ae": { country: "ae", tld: "ae" },
  "amazon.eg": { country: "eg", tld: "eg" },
  "amazon.com.tr": { country: "tr", tld: "com.tr" },
  "amazon.sg": { country: "sg", tld: "sg" },
};

/**
 * Match the 10-character ASIN inside any of the common Amazon path patterns:
 *   /dp/<ASIN>            (most common, all TLDs)
 *   /gp/product/<ASIN>    (legacy)
 *   /exec/obidos/ASIN/<ASIN>  (very old, occasionally seen)
 *   /product/<ASIN>       (some affiliate/short forms)
 */
const ASIN_RE =
  /\/(?:dp|gp\/product|product|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i;

/** Bare 10-char ASIN string (used when the input is already an ASIN, not a URL). */
const BARE_ASIN_RE = /^[A-Z0-9]{10}$/i;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^(?:www|smile)\./, "");
}

/**
 * Parse an Amazon product URL into its ASIN + marketplace.
 *
 * Returns null when:
 * - The URL is malformed (not a parseable URL string).
 * - The hostname is not a recognized Amazon TLD.
 * - No ASIN can be extracted from the path.
 *
 * Accepts a bare ASIN (e.g. "B00JEV5UI8") and treats it as US/com — useful for
 * scripts and tests that already have the ASIN.
 */
export function parseAmazonUrl(
  input: string,
): { asin: string; marketplace: Marketplace } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare ASIN — assume US marketplace.
  if (BARE_ASIN_RE.test(trimmed)) {
    return { asin: trimmed.toUpperCase(), marketplace: DEFAULT_MARKETPLACE };
  }

  let hostname: string;
  try {
    hostname = normalizeHostname(new URL(trimmed).hostname);
  } catch {
    return null;
  }

  const marketplace = MARKETPLACES[hostname];
  if (!marketplace) return null;

  const m = ASIN_RE.exec(trimmed);
  if (!m?.[1]) return null;

  return { asin: m[1].toUpperCase(), marketplace };
}

/**
 * Backward-compat helper. Returns just the ASIN, or null. Defaults marketplace
 * to US/com — call sites that need the marketplace should use parseAmazonUrl.
 */
export function extractAsin(url: string): string | null {
  return parseAmazonUrl(url)?.asin ?? null;
}

/**
 * Cross-platform product URL parser. Returns a discriminated union:
 *   { platform: "amazon", asin, marketplace, originalUrl }
 *   { platform: "generic", productId, hostname, originalUrl }
 *
 * "amazon" is the rich-data path — uses ScraperAPI's structured Amazon endpoint
 * for product, reviews, and competitor search. Includes the marketplace.
 *
 * "generic" is the degraded-but-honest path. Any other parseable URL is accepted;
 * the scraper falls back to schema.org/Product JSON-LD and OpenGraph meta tags.
 * No reviews, no competitors, no surfacing audit. The frontend shows a banner
 * telling the user the analysis is Amazon-tuned and may not fully apply.
 *
 * The `productId` for generic URLs is a SHA1-prefix derived from the URL itself —
 * we don't try to detect Flipkart's FSN, Meesho's numeric ID, etc. specifically,
 * because doing so would be the kind of per-platform hardcoding we want to avoid.
 * Cache keys, request IDs, and history entries use this synthetic ID.
 */
export type ParsedProductUrl =
  | {
      platform: "amazon";
      asin: string;
      marketplace: Marketplace;
      hostname: string;
      originalUrl: string;
    }
  | {
      platform: "generic";
      productId: string;
      hostname: string;
      originalUrl: string;
    };

/** Synthetic 12-char product ID derived from the URL (for cache keys and display). */
function syntheticIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return `gen-${Math.abs(hash).toString(36).padStart(8, "0").slice(0, 8)}`;
}

export function parseProductUrl(input: string): ParsedProductUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // First try Amazon — keeps the rich-data path for any recognized Amazon TLD.
  const amazon = parseAmazonUrl(trimmed);
  if (amazon) {
    let hostname = "";
    try {
      hostname = normalizeHostname(new URL(trimmed).hostname);
    } catch {
      hostname = `amazon.${amazon.marketplace.tld}`;
    }
    return {
      platform: "amazon",
      asin: amazon.asin,
      marketplace: amazon.marketplace,
      hostname,
      originalUrl: trimmed,
    };
  }

  // Generic path — anything else with a parseable URL and a hostname.
  let hostname: string;
  try {
    const u = new URL(trimmed);
    if (!u.hostname) return null;
    hostname = normalizeHostname(u.hostname);
  } catch {
    return null;
  }

  return {
    platform: "generic",
    productId: syntheticIdFromUrl(trimmed),
    hostname,
    originalUrl: trimmed,
  };
}
