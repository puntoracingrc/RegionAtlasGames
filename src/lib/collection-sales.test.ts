import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionListingStates,
  completedCollectionPurchases,
  completedCollectionSales,
} from "./collection-sales";
import type { MarketplaceListing } from "./marketplace-types";

function listing(overrides: Partial<MarketplaceListing>): MarketplaceListing {
  return {
    id: "listing-1",
    catalogId: "ps4-example",
    sellerId: "seller",
    sellerName: "Seller",
    sellerCity: "Madrid",
    collectionItemId: "copy-1",
    title: "Example",
    customTitle: null,
    customDescription: null,
    saleOptions: { pickup: true, shipping: true },
    askingPriceEur: 20,
    sellerLocation: null,
    platformSlug: "ps4",
    region: "PAL España",
    status: "draft",
    photos: [],
    aiAnalysis: null,
    sealed: false,
    collectionCondition: "complete",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    soldToUserId: null,
    soldToUserName: null,
    sellerConfirmedAt: null,
    buyerConfirmedAt: null,
    recordedSalePriceEur: null,
    ...overrides,
  };
}

test("keeps the strongest open state for each physical copy", () => {
  const states = collectionListingStates([
    listing({ id: "pending", status: "sold", sellerConfirmedAt: "2026-01-02" }),
    listing({ id: "draft", status: "draft" }),
    listing({ id: "active", status: "active" }),
  ]);

  assert.deepEqual(states, { "copy-1": "active" });
});

test("sales history contains only buyer-confirmed sales in newest-first order", () => {
  const completed = completedCollectionSales([
    listing({ id: "cancelled", status: "cancelled" }),
    listing({ id: "pending", status: "sold", recordedSalePriceEur: 20 }),
    listing({
      id: "older",
      status: "sold",
      buyerConfirmedAt: "2026-01-02T00:00:00.000Z",
      recordedSalePriceEur: 20,
    }),
    listing({
      id: "newer",
      status: "sold",
      buyerConfirmedAt: "2026-02-02T00:00:00.000Z",
      recordedSalePriceEur: 25,
    }),
  ]);

  assert.deepEqual(completed.map((entry) => entry.id), ["newer", "older"]);
});

test("purchase history contains only the buyer's confirmed purchases", () => {
  const completed = completedCollectionPurchases(
    [
      listing({
        id: "other-buyer",
        status: "sold",
        soldToUserId: "buyer-2",
        buyerConfirmedAt: "2026-03-02T00:00:00.000Z",
        recordedSalePriceEur: 30,
      }),
      listing({
        id: "pending",
        status: "sold",
        soldToUserId: "buyer-1",
        recordedSalePriceEur: 25,
      }),
      listing({
        id: "older",
        status: "sold",
        soldToUserId: "buyer-1",
        buyerConfirmedAt: "2026-01-02T00:00:00.000Z",
        recordedSalePriceEur: 20,
      }),
      listing({
        id: "newer",
        status: "sold",
        soldToUserId: "buyer-1",
        buyerConfirmedAt: "2026-02-02T00:00:00.000Z",
        recordedSalePriceEur: 25,
      }),
    ],
    "buyer-1",
  );

  assert.deepEqual(completed.map((entry) => entry.id), ["newer", "older"]);
});
