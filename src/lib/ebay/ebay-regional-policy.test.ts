import assert from "node:assert/strict";
import test from "node:test";
import {
  ebayRegionalSearchFilters,
  ebayRegionalSearchPolicy,
} from "./ebay-regional-policy";

test("always searches eBay Spain for delivery to Spain", () => {
  const policy = ebayRegionalSearchPolicy("USA", "28001");
  assert.equal(policy.marketplaceId, "EBAY_ES");
  assert.equal(policy.destinationCountry, "ES");
  assert.equal(policy.destinationPostalCode, "28001");
  assert.deepEqual(ebayRegionalSearchFilters(policy), [
    "buyingOptions:{FIXED_PRICE}",
    "deliveryCountry:ES",
    "deliveryPostalCode:28001",
    "itemLocationCountry:US",
  ]);
});

test("maps the PS4 catalog regions to the intended seller origin", () => {
  assert.equal(ebayRegionalSearchPolicy("PAL España").itemLocationCountry, "ES");
  assert.equal(ebayRegionalSearchPolicy("PAL UK/ENG").itemLocationCountry, "GB");
  assert.equal(ebayRegionalSearchPolicy("USA").itemLocationCountry, "US");
  assert.equal(ebayRegionalSearchPolicy("Japón").itemLocationCountry, "JP");
  assert.equal(ebayRegionalSearchPolicy("JAPAN").itemLocationCountry, "JP");
});

test("uses the European Union only for a generic PAL Europe edition", () => {
  const policy = ebayRegionalSearchPolicy("PAL Europa");
  assert.equal(policy.itemLocationCountry, null);
  assert.equal(policy.itemLocationRegion, "EUROPEAN_UNION");
  assert.equal(policy.importCostsMayApply, false);
});
