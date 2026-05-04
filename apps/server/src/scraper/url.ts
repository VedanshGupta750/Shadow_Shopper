const ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/;

/** Extract a 10-character ASIN from an Amazon product URL. Returns null if no match. */
export function extractAsin(url: string): string | null {
  const match = ASIN_RE.exec(url);
  return match?.[1] ?? null;
}
