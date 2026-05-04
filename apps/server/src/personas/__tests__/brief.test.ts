import { describe, it, expect } from "vitest";
import { buildBrief } from "../brief.js";
import type { AmazonProduct, AmazonReview, AmazonSearchResult } from "../../types/amazon.js";

const mockProduct: AmazonProduct = {
  asin: "B09TEST1234",
  name: "Test Widget Pro 3000",
  brand: "WidgetCo",
  price_string: "$49.99",
  rating: 4.2,
  total_reviews: 1500,
  bullets: ["Durable steel construction", "Dishwasher safe", "Lifetime warranty"],
  description: "The best widget money can buy.",
  images: ["img1.jpg"],
  in_stock: true,
};

function makeReview(overrides: Partial<AmazonReview> & { id: string; rating: number }): AmazonReview {
  return {
    title: "Review title",
    body: "Review body",
    reviewer_name: "Reviewer",
    verified_purchase: true,
    ...overrides,
  };
}

const mixedReviews: AmazonReview[] = [
  makeReview({ id: "r1", rating: 5, title: "Amazing!", body: "Loved it so much" }),
  makeReview({ id: "r2", rating: 5, title: "Great value", body: "Worth every penny" }),
  makeReview({ id: "r3", rating: 4, title: "Pretty good", body: "Solid purchase" }),
  makeReview({ id: "r4", rating: 1, title: "Terrible", body: "Broke in a day" }),
  makeReview({ id: "r5", rating: 2, title: "Meh", body: "Not worth it" }),
  makeReview({ id: "r6", rating: 3, title: "OK", body: "It's fine I guess" }),
];

const mockCompetitors: AmazonSearchResult[] = [
  { asin: "B000COMP01", title: "Competitor Widget A", url: "/dp/B000COMP01", price_string: "$39.99", rating: 4.5 },
  { asin: "B000COMP02", title: "Competitor Widget B", url: "/dp/B000COMP02", price_string: "$59.99", rating: 3.8 },
];

describe("buildBrief", () => {
  it("includes product name, brand, price, and rating", () => {
    // Arrange & Act
    const brief = buildBrief(mockProduct, [], []);

    // Assert
    expect(brief).toContain("Test Widget Pro 3000");
    expect(brief).toContain("WidgetCo");
    expect(brief).toContain("$49.99");
    expect(brief).toContain("4.2/5");
    expect(brief).toContain("1500 reviews");
  });

  it("includes feature bullets", () => {
    // Arrange & Act
    const brief = buildBrief(mockProduct, [], []);

    // Assert
    expect(brief).toContain("Durable steel construction");
    expect(brief).toContain("Dishwasher safe");
  });

  it("truncates review body to 200 characters", () => {
    // Arrange
    const longBody = "A".repeat(300);
    const reviews = [makeReview({ id: "long", rating: 5, body: longBody })];

    // Act
    const brief = buildBrief(mockProduct, reviews, []);

    // Assert
    expect(brief).not.toContain("A".repeat(201));
    expect(brief).toContain("A".repeat(200));
  });

  it("mixes high and low reviews with low-rated first", () => {
    // Arrange & Act
    const brief = buildBrief(mockProduct, mixedReviews, []);

    // Assert - low-rated reviews should appear before high-rated ones in the interleave
    const terribleIdx = brief.indexOf("Terrible");
    const amazingIdx = brief.indexOf("Amazing!");
    expect(terribleIdx).toBeGreaterThan(-1);
    expect(amazingIdx).toBeGreaterThan(-1);
    expect(terribleIdx).toBeLessThan(amazingIdx);
  });

  it("caps reviews at 10", () => {
    // Arrange
    const manyReviews = Array.from({ length: 20 }, (_, i) =>
      makeReview({ id: `r${i}`, rating: i % 5 + 1, title: `Review ${i}` }),
    );

    // Act
    const brief = buildBrief(mockProduct, manyReviews, []);

    // Assert - count review lines (lines starting with [<digit>★)
    const reviewLines = brief.split("\n").filter((l) => /^\[\d★/.test(l));
    expect(reviewLines.length).toBeLessThanOrEqual(10);
  });

  it("includes competitor data when present", () => {
    // Arrange & Act
    const brief = buildBrief(mockProduct, [], mockCompetitors);

    // Assert
    expect(brief).toContain("Competitor Widget A");
    expect(brief).toContain("$39.99");
  });

  it("gracefully degrades when competitors are empty", () => {
    // Arrange & Act
    const brief = buildBrief(mockProduct, [], []);

    // Assert
    expect(brief).toContain("No competitor data available");
  });

  it("shows 'no individual reviews' when reviews are empty", () => {
    // Arrange & Act
    const brief = buildBrief(mockProduct, [], []);

    // Assert
    expect(brief).toContain("No individual reviews available");
  });
});
