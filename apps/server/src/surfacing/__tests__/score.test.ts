import { describe, it, expect } from "vitest";
import {
  tokenize,
  overlapRatio,
  findTargetPosition,
  bucketScore,
  scoreSurfacing,
  MATCH_THRESHOLD,
} from "../score.js";

describe("tokenize", () => {
  it("lowercases and strips punctuation", () => {
    const t = tokenize("Apple iPad Air, 5th Generation!");
    expect(t.has("apple")).toBe(true);
    expect(t.has("ipad")).toBe(true);
    expect(t.has("generation")).toBe(true);
    expect(t.has("5th")).toBe(true);
  });

  it("drops stopwords and short tokens", () => {
    const t = tokenize("The big and the small");
    expect(t.has("the")).toBe(false);
    expect(t.has("and")).toBe(false);
    expect(t.has("big")).toBe(true);
    expect(t.has("small")).toBe(true);
  });
});

describe("overlapRatio", () => {
  it("returns 1.0 for identical token sets", () => {
    const a = tokenize("apple ipad air");
    const b = tokenize("apple ipad air");
    expect(overlapRatio(a, b)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = tokenize("apple ipad air");
    const b = tokenize("samsung galaxy tab");
    expect(overlapRatio(a, b)).toBe(0);
  });

  it("ratio is over the smaller set", () => {
    const a = tokenize("apple ipad");
    const b = tokenize("apple ipad air pro 5th gen wifi 64gb pink m1 chip");
    // a has 2 tokens, both appear in b → 2/2 = 1.0
    expect(overlapRatio(a, b)).toBe(1);
  });

  it("returns 0 when either side is empty", () => {
    expect(overlapRatio(new Set(), tokenize("apple"))).toBe(0);
    expect(overlapRatio(tokenize("apple"), new Set())).toBe(0);
  });
});

describe("findTargetPosition", () => {
  const target = "Apple iPad Air (5th Generation): with M1 chip, 10.9-inch Liquid Retina, 64GB, Wi-Fi 6, Pink";

  it("returns 1 for exact-ish match at position 0", () => {
    const mentioned = ["Apple iPad Air 5th Gen", "Samsung Galaxy Tab", "Microsoft Surface Pro"];
    expect(findTargetPosition(target, mentioned)).toBe(1);
  });

  it("returns 2 when target is second", () => {
    const mentioned = ["Samsung Galaxy Tab", "Apple iPad Air 5th Gen", "Microsoft Surface"];
    expect(findTargetPosition(target, mentioned)).toBe(2);
  });

  it("returns null when target is not mentioned", () => {
    const mentioned = ["Samsung Galaxy Tab", "Microsoft Surface", "Lenovo Tab P11"];
    expect(findTargetPosition(target, mentioned)).toBe(null);
  });

  it("returns null for empty mentioned list", () => {
    expect(findTargetPosition(target, [])).toBe(null);
  });

  it("matches loosely-worded same-product mention", () => {
    const mentioned = ["iPad Air"];
    // tokens: "ipad", "air" → both in target. ratio = 2/2 = 1.0 ≥ threshold.
    expect(findTargetPosition(target, mentioned)).toBe(1);
  });

  it("does not match a different SKU of same brand", () => {
    const targetMin = "Apple AirPods Pro 2nd Gen Bluetooth Earbuds Wireless";
    const mentioned = ["Apple Watch Series 10"];
    // overlap: "apple" only → 1 / min(2 small set) = 0.5 → below threshold
    expect(findTargetPosition(targetMin, mentioned)).toBe(null);
  });

  it("threshold MATCH_THRESHOLD is 0.6", () => {
    expect(MATCH_THRESHOLD).toBe(0.6);
  });
});

describe("bucketScore", () => {
  it("position 1 → green", () => {
    expect(bucketScore(1)).toBe("green");
  });
  it("position 2 → yellow", () => {
    expect(bucketScore(2)).toBe("yellow");
  });
  it("position 3 → yellow", () => {
    expect(bucketScore(3)).toBe("yellow");
  });
  it("position 4 → yellow (still yellow per spec)", () => {
    expect(bucketScore(4)).toBe("yellow");
  });
  it("null → red", () => {
    expect(bucketScore(null)).toBe("red");
  });
});

describe("scoreSurfacing", () => {
  const target = "Apple iPad Air 5th Generation 64GB Pink";

  it("green when target is the first mention", () => {
    const r = scoreSurfacing("B09V3KXJPB", target, ["iPad Air", "Samsung Galaxy", "Surface Pro"]);
    expect(r.mentioned_target).toBe(true);
    expect(r.mentioned_position).toBe(1);
    expect(r.score).toBe("green");
  });

  it("yellow when buried", () => {
    const r = scoreSurfacing("B09V3KXJPB", target, ["Surface Pro", "Samsung Galaxy", "iPad Air"]);
    expect(r.mentioned_position).toBe(3);
    expect(r.score).toBe("yellow");
  });

  it("red when missing", () => {
    const r = scoreSurfacing("B09V3KXJPB", target, ["Surface Pro", "Samsung Galaxy", "Lenovo Tab"]);
    expect(r.mentioned_target).toBe(false);
    expect(r.mentioned_position).toBe(null);
    expect(r.score).toBe("red");
  });
});
