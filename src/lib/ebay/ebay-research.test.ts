import assert from "node:assert/strict";
import test from "node:test";
import { aggregateEbayListings, type EbayResearchListing } from "./ebay-research";

function listing(overrides: Partial<EbayResearchListing> = {}): EbayResearchListing {
  return {
    itemId: "item-1",
    marketplaceId: "EBAY_ES",
    title: "Game",
    url: null,
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
    sellerCountry: "ES",
    itemEndDate: null,
    condition: "Used",
    conditionBucket: "complete",
    decision: "accept",
    confidence: 0.9,
    platformMatch: "exact",
    regionMatch: "exact",
    suggestedRegion: "PAL España",
    exactIdentifier: false,
    exactReference: false,
    epid: null,
    gtin: null,
    reasons: [],
    searchBasis: [{ kind: "keyword", value: "Game" }],
    ...overrides,
  };
}

test("never mixes another regional variant into the current estimate", () => {
  const estimates = aggregateEbayListings([
    listing({ itemId: "es-1", price: 20, shippingPrice: 5, totalPrice: 25 }),
    listing({ itemId: "es-2", price: 30, shippingPrice: 7, totalPrice: 37 }),
    listing({ itemId: "us-1", decision: "other_variant", price: 200, totalPrice: 220, suggestedRegion: "USA" }),
  ]);
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].median, 25);
  assert.equal(estimates[0].observations, 2);
  assert.equal(estimates[0].shippingMedian, 6);
  assert.equal(estimates[0].totalToSpainMedian, 31);
  assert.equal(estimates[0].verified, false);
});

test("requires three accepted observations before marking an estimate verified", () => {
  const two = aggregateEbayListings([
    listing({ itemId: "one", price: 18 }),
    listing({ itemId: "two", price: 22 }),
  ]);
  assert.equal(two[0].label, "estimated");
  assert.equal(two[0].verified, false);

  const three = aggregateEbayListings([
    listing({ itemId: "one", price: 18 }),
    listing({ itemId: "two", price: 22 }),
    listing({ itemId: "three", price: 20 }),
  ]);
  assert.equal(three[0].median, 20);
  assert.equal(three[0].label, "verified");
  assert.equal(three[0].verified, true);
});

test("does not aggregate rejected, review or unknown-condition listings", () => {
  const estimates = aggregateEbayListings([
    listing({ decision: "review" }),
    listing({ decision: "reject" }),
    listing({ conditionBucket: "unknown" }),
  ]);
  assert.deepEqual(estimates, []);
});
