import assert from "node:assert/strict";
import test from "node:test";
import {
  ebayAffiliateSearchFilter,
  isSpanishEbayLocation,
  mergeSpainFirstEbayOffers,
  shouldExpandEbaySearch,
} from "./ebay-offer-priority";

test("filters the first eBay pass to items in Spain that ship to Spain", () => {
  assert.equal(
    ebayAffiliateSearchFilter("spain"),
    "buyingOptions:{FIXED_PRICE},deliveryCountry:ES,itemLocationCountry:ES",
  );
  assert.equal(
    ebayAffiliateSearchFilter("expanded"),
    "buyingOptions:{FIXED_PRICE},deliveryCountry:ES",
  );
});

test("expands the search only when Spain has too few valid offers", () => {
  assert.equal(shouldExpandEbaySearch(0, 3), true);
  assert.equal(shouldExpandEbaySearch(2, 3), true);
  assert.equal(shouldExpandEbaySearch(3, 3), false);
});

test("keeps Spanish offers first and deduplicates the expanded response", () => {
  const offers = mergeSpainFirstEbayOffers(
    [
      { id: "es-1", location: "ES", price: 20 },
      { id: "es-2", location: null, price: 25 },
    ],
    [
      { id: "fr-1", location: "FR", price: 12 },
      { id: "es-1", location: "ES", price: 19 },
      { id: "es-3", location: "Spain", price: 30 },
    ],
    4,
  );

  assert.deepEqual(
    offers.map((offer) => [offer.id, offer.marketScope]),
    [
      ["es-1", "spain"],
      ["es-2", "spain"],
      ["es-3", "spain"],
      ["fr-1", "international"],
    ],
  );
  assert.equal(isSpanishEbayLocation("España"), true);
  assert.equal(isSpanishEbayLocation("FR"), false);
});
