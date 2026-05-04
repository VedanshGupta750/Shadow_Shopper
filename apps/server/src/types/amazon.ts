/** Core product data scraped from an Amazon product detail page. */
export interface AmazonProduct {
  asin: string;
  name: string;
  brand: string;
  price_string: string;
  price_number?: number | undefined;
  rating?: number | undefined;
  total_reviews?: number | undefined;
  bullets: string[];
  description?: string | undefined;
  images: string[];
  features?: Record<string, string> | undefined;
  in_stock?: boolean | undefined;
}

/** A single customer review from an Amazon product page. */
export interface AmazonReview {
  id: string;
  title: string;
  body: string;
  rating: number;
  reviewer_name: string;
  verified_purchase: boolean;
  date_iso?: string | undefined;
  helpful_votes?: number | undefined;
}

/** A single result from an Amazon search query. */
export interface AmazonSearchResult {
  asin: string;
  title: string;
  url: string;
  price_string?: string | undefined;
  image?: string | undefined;
  rating?: number | undefined;
  total_reviews?: number | undefined;
}
