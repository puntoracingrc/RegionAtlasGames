import assert from "node:assert/strict";
import test from "node:test";
import {
  coarsenListingLocation,
  listingAskingPriceEur,
  normalizeAskingPriceEur,
} from "./marketplace-listing-values";

test("keeps asking and final sale prices as separate values", () => {
  assert.equal(
    listingAskingPriceEur({
      askingPriceEur: 24.95,
      recordedSalePriceEur: 20,
      status: "active",
    }),
    24.95,
  );
  assert.equal(
    listingAskingPriceEur({
      askingPriceEur: null,
      recordedSalePriceEur: 20,
      status: "sold",
    }),
    null,
  );
});

test("supports legacy open listings without presenting sold prices as asking prices", () => {
  assert.equal(
    listingAskingPriceEur({
      askingPriceEur: undefined,
      recordedSalePriceEur: 19,
      status: "active",
    }),
    19,
  );
  assert.equal(normalizeAskingPriceEur("17,50"), 17.5);
});

test("stores only coarse seller coordinates", () => {
  assert.deepEqual(
    coarsenListingLocation({ latitude: 40.416775, longitude: -3.70379 }),
    { latitude: 40.4, longitude: -3.7, precision: "approximate" },
  );
  assert.equal(coarsenListingLocation({ latitude: 100, longitude: -3 }), null);
  assert.equal(coarsenListingLocation({ latitude: null, longitude: null }), null);
});
