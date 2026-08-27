import assert from "node:assert/strict";
import test from "node:test";
import { aggregateEbayListings, type EbayResearchListing } from "./ebay-research";

function listing(overrides: Partial<EbayResearchListing> = {}): EbayResearchListing {
  return {
    itemId: "item-1",
    title: "Game",
    url: null,
    affiliateUrl: null,
    imageUrls: [],
    price: 20,
    shippingPrice: 2,
    totalPrice: 22,
    currency: "EUR",
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
    listing({ itemId: "es-1", totalPrice: 20 }),
    listing({ itemId: "es-2", totalPrice: 30 }),
    listing({ itemId: "us-1", decision: "other_variant", totalPrice: 200, suggestedRegion: "USA" }),
  ]);
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0].median, 25);
  assert.equal(estimates[0].observations, 2);
  assert.equal(estimates[0].verified, false);
});

test("requires three accepted observations before marking an estimate verified", () => {
  const two = aggregateEbayListings([
    listing({ itemId: "one", totalPrice: 18 }),
    listing({ itemId: "two", totalPrice: 22 }),
  ]);
  assert.equal(two[0].label, "estimated");
  assert.equal(two[0].verified, false);

  const three = aggregateEbayListings([
    listing({ itemId: "one", totalPrice: 18 }),
    listing({ itemId: "two", totalPrice: 22 }),
    listing({ itemId: "three", totalPrice: 20 }),
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
