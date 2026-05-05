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
