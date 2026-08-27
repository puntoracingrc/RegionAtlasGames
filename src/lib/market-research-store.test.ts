import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStoredMarketEstimates,
  mergeMarketResearchDocument,
  type MarketResearchCatalogDocument,
} from "./market-research-store";
import type { MarketObservation, MarketResearchRun } from "./market-research-types";

const NOW = "2026-08-27T12:00:00.000Z";

function observation(overrides: Partial<MarketObservation> = {}): MarketObservation {
  return {
    id: "ebay:EBAY_ES:item-1",
    source: "ebay",
    marketplaceId: "EBAY_ES",
    listingId: "item-1",
    catalogId: "ps2-game",
    originCatalogId: "ps2-game",
    sourceDecision: "accept",
    reviewStatus: "accepted",
    title: "Game PS2 PAL España completo",
    url: "https://www.ebay.es/itm/item-1",
    affiliateUrl: null,
    imageUrls: [],
    price: 20,
    originalPrice: null,
    originalCurrency: null,
    shippingPrice: 2,
    totalPrice: 22,
    currency: "EUR",
    originLabel: "España",
    importCostsMayApply: false,
    condition: "Used",
    conditionBucket: "complete",
    confidence: 0.9,
    detectedRegion: "PAL España",
    targetRegion: "PAL España",
    sellerCountry: "ES",
    itemEndDate: "2026-09-30T00:00:00.000Z",
    exactIdentifier: false,
    exactReference: false,
    epid: null,
    gtin: null,
    reasons: [],
    searchBasis: [{ kind: "keyword", value: "Game PS2 PAL España" }],
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    seenCount: 1,
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  };
}

function document(observations: MarketObservation[] = []): MarketResearchCatalogDocument {
  return {
    schemaVersion: 1,
    catalogId: "ps2-game",
    title: "Game",
    platformSlug: "ps2",
    region: "PAL España",
    updatedAt: NOW,
    lastCollectedAt: NOW,
    observations,
    coverCandidates: [],
    runs: [],
    publications: [],
  };
}

function run(): MarketResearchRun {
  return {
    id: "run-1",
    catalogId: "ps2-game",
    collectedAt: NOW,
    collectedBy: "admin@example.test",
    accepted: 1,
    pending: 0,
    routed: 0,
    rejected: 0,
    coverCandidates: 0,
    warnings: [],
  };
}

test("requires three distinct current observations and removes strong outliers", () => {
  const values = [20, 21, 22, 23, 24, 999];
  const estimates = calculateStoredMarketEstimates(values.map((value, index) => observation({
    id: `ebay:EBAY_ES:item-${index}`,
    listingId: `item-${index}`,
    price: value,
    totalPrice: value + 2,
  })), Date.parse(NOW));
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].verified, true);
  assert.equal(estimates[0].publishable, true);
  assert.equal(estimates[0].observations, 5);
  assert.equal(estimates[0].outliers, 1);
  assert.equal(estimates[0].median, 22);
  assert.equal(estimates[0].shippingMedian, 2);
  assert.equal(estimates[0].totalToSpainMedian, 24);
});

test("does not publish expired, rejected or non-EUR evidence", () => {
  const estimates = calculateStoredMarketEstimates([
    observation({ id: "expired", listingId: "expired", lastSeenAt: "2026-01-01T00:00:00.000Z" }),
    observation({ id: "rejected", listingId: "rejected", reviewStatus: "rejected" }),
    observation({ id: "usd-1", listingId: "usd-1", currency: "USD" }),
    observation({ id: "usd-2", listingId: "usd-2", currency: "USD" }),
    observation({ id: "usd-3", listingId: "usd-3", currency: "USD" }),
  ], Date.parse(NOW));
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].currency, "USD");
  assert.equal(estimates[0].verified, true);
  assert.equal(estimates[0].publishable, false);
});

test("deduplicates an eBay item and preserves an explicit admin rejection", () => {
  const existing = observation({
    reviewStatus: "rejected",
    reviewedAt: "2026-08-27T11:00:00.000Z",
    reviewedBy: "admin@example.test",
  });
  const incoming = observation({ price: 23, totalPrice: 25, seenCount: 0 });
  const merged = mergeMarketResearchDocument(document([existing]), {
    identity: { catalogId: "ps2-game", title: "Game", platformSlug: "ps2", region: "PAL España" },
    observations: [incoming],
    covers: [],
    run: run(),
  });
  assert.equal(merged.observations.length, 1);
  assert.equal(merged.observations[0].totalPrice, 25);
  assert.equal(merged.observations[0].price, 23);
  assert.equal(merged.observations[0].seenCount, 2);
  assert.equal(merged.observations[0].reviewStatus, "rejected");
  assert.equal(merged.observations[0].reviewedBy, "admin@example.test");
});
