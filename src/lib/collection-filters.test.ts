import assert from "node:assert/strict";
import test from "node:test";
import { groupCollectionDisplayItems } from "./collection-display";
import {
  DEFAULT_COLLECTION_FILTERS,
  filterCollection,
  sortCollectionDisplayItems,
} from "./collection-filters";
import type { CollectionView, GameFilters } from "./types";

function item(overrides: Partial<CollectionView>): CollectionView {
  return {
    id: "copy-1",
    catalogId: "ps4-example",
    catalogMatched: true,
    inRetroCatalog: true,
    title: "Example",
    titlePc: "Example",
    pcId: null,
    platformSlug: "ps4",
    region: "PAL España",
    sealed: false,
    collectionCondition: "unknown",
    quantity: 1,
    quantityPc: null,
    buyPrice: null,
    previousSalePrice: null,
    totalValue: 20,
    notes: null,
    marketMin: null,
    marketMax: null,
    recommendedPrice: 20,
    pcRefPrice: null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: null,
    hasEsPrice: true,
    coverUrl: null,
    addedAt: "2026-01-01",
    purchasedAt: null,
    ...overrides,
  };
}

function filters(overrides: Partial<GameFilters>): GameFilters {
  return { ...DEFAULT_COLLECTION_FILTERS, ...overrides };
}

test("filters individual copies by condition and listing state", () => {
  const source = [
    item({ id: "sealed", sealed: true, collectionCondition: "sealed" }),
    item({ id: "complete", collectionCondition: "complete" }),
    item({ id: "loose", collectionCondition: "loose" }),
  ];
  const states = {
    sealed: "active",
    complete: "draft",
  } as const;

  assert.deepEqual(
    filterCollection(source, filters({ condition: "complete" }), states).map((entry) => entry.id),
    ["complete"],
  );
  assert.deepEqual(
    filterCollection(source, filters({ sale: "active" }), states).map((entry) => entry.id),
    ["sealed"],
  );
  assert.deepEqual(
    filterCollection(source, filters({ sale: "not-listed" }), states).map((entry) => entry.id),
    ["loose"],
  );
});

test("sorts grouped titles by price, quantity and collection dates", () => {
  const grouped = groupCollectionDisplayItems([
    item({
      id: "a-1",
      catalogId: "a",
      title: "Alpha",
      recommendedPrice: 10,
      addedAt: "2026-01-01",
      purchasedAt: "2025-05-01",
    }),
    item({
      id: "a-2",
      catalogId: "a",
      title: "Alpha",
      recommendedPrice: 10,
      addedAt: "2026-02-01",
      purchasedAt: "2025-06-01",
    }),
    item({
      id: "b-1",
      catalogId: "b",
      title: "Beta",
      recommendedPrice: 30,
      addedAt: "2025-01-01",
      purchasedAt: "2026-01-01",
    }),
  ]);

  assert.deepEqual(
    sortCollectionDisplayItems(grouped, "price-desc").map((entry) => entry.game.title),
    ["Beta", "Alpha"],
  );
  assert.deepEqual(
    sortCollectionDisplayItems(grouped, "quantity-desc").map((entry) => entry.game.title),
    ["Alpha", "Beta"],
  );
  assert.deepEqual(
    sortCollectionDisplayItems(grouped, "purchased-desc").map((entry) => entry.game.title),
    ["Beta", "Alpha"],
  );
  assert.deepEqual(
    sortCollectionDisplayItems(grouped, "added-desc").map((entry) => entry.game.title),
    ["Alpha", "Beta"],
  );
});
