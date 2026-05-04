import { describe, it, expect } from "vitest";
import { extractAsin } from "../url.js";

describe("extractAsin", () => {
  it("extracts ASIN from a standard /dp/ URL", () => {
    const url = "https://www.amazon.com/dp/B0CHX1W1XY/ref=cm_cr_arp_d_product_top";
    expect(extractAsin(url)).toBe("B0CHX1W1XY");
  });

  it("extracts ASIN from a /gp/product/ URL", () => {
    const url = "https://www.amazon.com/gp/product/B09V3KXJPB?th=1";
    expect(extractAsin(url)).toBe("B09V3KXJPB");
  });

  it("extracts ASIN from a URL with title slug before /dp/", () => {
    const url = "https://www.amazon.com/Some-Product-Name/dp/B08N5WRWNW/ref=sr_1_1";
    expect(extractAsin(url)).toBe("B08N5WRWNW");
  });

  it("returns null for a non-Amazon URL", () => {
    expect(extractAsin("https://www.google.com/search?q=headphones")).toBeNull();
  });

  it("returns null for an Amazon URL without a product path", () => {
    expect(extractAsin("https://www.amazon.com/s?k=headphones")).toBeNull();
  });

  it("returns null when the ASIN-like segment is the wrong length", () => {
    expect(extractAsin("https://www.amazon.com/dp/B0SHORT")).toBeNull();
  });

  it("handles amazon.co.uk domain the same way", () => {
    const url = "https://www.amazon.co.uk/dp/B0CHX1W1XY";
    expect(extractAsin(url)).toBe("B0CHX1W1XY");
  });
});
