import assert from "node:assert/strict";
import test from "node:test";
import {
  offerDistanceKm,
  sortCatalogOffers,
  type CatalogOfferSortValue,
} from "./catalog-offer-sort";

const offers: CatalogOfferSortValue[] = [
  {
    id: "madrid",
    priceEur: 20,
    listedAt: "2026-08-30T10:00:00.000Z",
    location: { latitude: 40.4, longitude: -3.7 },
  },
  {
    id: "valencia",
    priceEur: 15,
    listedAt: "2026-08-29T10:00:00.000Z",
    location: { latitude: 39.5, longitude: -0.4 },
  },
  { id: "unknown", priceEur: null, listedAt: null, location: null },
];

test("sorts offers by price and leaves missing prices last", () => {
  assert.deepEqual(
    sortCatalogOffers(offers, "price", null).map((offer) => offer.id),
    ["valencia", "madrid", "unknown"],
  );
});

test("sorts offers by newest date", () => {
  assert.deepEqual(
    sortCatalogOffers(offers, "date", null).map((offer) => offer.id),
    ["madrid", "valencia", "unknown"],
  );
});

test("sorts by approximate distance and leaves unknown locations last", () => {
  const buyer = { latitude: 40.4, longitude: -3.7 };
  assert.deepEqual(
    sortCatalogOffers(offers, "distance", buyer).map((offer) => offer.id),
    ["madrid", "valencia", "unknown"],
  );
  assert.ok(offerDistanceKm(buyer, offers[1].location!) > 250);
});
