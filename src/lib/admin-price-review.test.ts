import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePriceReviewTriageFilter,
  priceReviewMatchesTriageFilter,
  priceReviewTriageBucket,
  type PriceReviewItem,
} from "./admin-price-review";

function review(overrides: Partial<PriceReviewItem> = {}): PriceReviewItem {
  return {
    id: "review-1",
    status: "pending",
    source: "todoconsolas",
    platformSlug: "ps5",
    listingTitle: "Juego PS5 (SP)",
    priceEur: 24.95,
    reason: "catalog_match_not_unique",
    ...overrides,
  };
}

test("uses persisted TodoConsolas triage buckets", () => {
  assert.equal(priceReviewTriageBucket(review({ triageBucket: "regional_variant" })), "regional_variant");
});

test("derives useful fallback buckets for old queue items", () => {
  assert.equal(priceReviewTriageBucket(review({ reason: "price_out_of_range" })), "price_anomaly");
  assert.equal(priceReviewTriageBucket(review({ reason: "catalog_region_not_exact" })), "regional_variant");
  assert.equal(priceReviewTriageBucket(review({ reason: "listing_region_missing" })), "missing_region");
  assert.equal(priceReviewTriageBucket(review()), "catalog_gap");
  assert.equal(
    priceReviewTriageBucket(review({ candidateCatalogId: "ps5-game" })),
    "manual_match",
  );
});

test("keeps non-TodoConsolas reviews in the actionable inbox", () => {
  const item = review({ source: "game-es-preowned" });
  assert.equal(priceReviewTriageBucket(item), "manual_match");
  assert.equal(priceReviewMatchesTriageFilter(item, "actionable"), true);
});

test("actionable combines manual matches and missing regions only", () => {
  assert.equal(priceReviewMatchesTriageFilter(review({ triageBucket: "manual_match" }), "actionable"), true);
  assert.equal(priceReviewMatchesTriageFilter(review({ triageBucket: "missing_region" }), "actionable"), true);
  assert.equal(priceReviewMatchesTriageFilter(review({ triageBucket: "catalog_gap" }), "actionable"), false);
});

test("normalizes unknown API filters to the actionable inbox", () => {
  assert.equal(normalizePriceReviewTriageFilter("catalog_gap"), "catalog_gap");
  assert.equal(normalizePriceReviewTriageFilter("unexpected"), "actionable");
  assert.equal(normalizePriceReviewTriageFilter(null), "actionable");
});
