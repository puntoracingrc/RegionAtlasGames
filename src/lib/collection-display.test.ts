import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionView } from "./types";
import {
  formatCollectionConditionSummary,
  groupCollectionDisplayItems,
} from "./collection-display";

function item(overrides: Partial<CollectionView>): CollectionView {
  return {
    id: "copy-1",
    catalogId: "ps5-example",
    catalogMatched: true,
    inRetroCatalog: true,
    title: "Example",
    titlePc: "Example",
    pcId: null,
    platformSlug: "ps5",
    region: "PAL España",
    sealed: false,
    collectionCondition: "unknown",
    quantity: 1,
    quantityPc: null,
    buyPrice: null,
    previousSalePrice: null,
    totalValue: 20,
    addedAt: "2026-08-01T00:00:00.000Z",
    purchasedAt: null,
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
    ...overrides,
  };
}

test("groups copies of the same catalog game and preserves their conditions", () => {
  const grouped = groupCollectionDisplayItems([
    item({ id: "sealed", sealed: true, collectionCondition: "sealed", quantity: 2, totalValue: 40 }),
    item({ id: "complete", collectionCondition: "complete", totalValue: 20 }),
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.units, 3);
  assert.equal(grouped[0]?.game.quantity, 3);
  assert.equal(grouped[0]?.game.totalValue, 60);
  assert.deepEqual(grouped[0]?.conditionCounts, {
    sealed: 2,
    complete: 1,
    "game-manual": 0,
    loose: 0,
    unknown: 0,
  });
  assert.deepEqual(grouped[0]?.itemIds, ["sealed", "complete"]);
  assert.equal(
    formatCollectionConditionSummary(grouped[0]!.conditionCounts),
    "2 precintadas · 1 completo",
  );
});

test("keeps the earliest and latest dates across copies", () => {
  const grouped = groupCollectionDisplayItems([
    item({ id: "older", addedAt: "2025-01-01", purchasedAt: "2024-02-01" }),
    item({ id: "newer", addedAt: "2026-03-01", purchasedAt: "2026-02-01" }),
  ]);

  assert.equal(grouped[0]?.earliestAddedAt, "2025-01-01");
  assert.equal(grouped[0]?.latestAddedAt, "2026-03-01");
  assert.equal(grouped[0]?.earliestPurchasedAt, "2024-02-01");
  assert.equal(grouped[0]?.latestPurchasedAt, "2026-02-01");
});

test("does not merge pending rows without a catalog identity", () => {
  const grouped = groupCollectionDisplayItems([
    item({ id: "pending-1", catalogId: null, catalogMatched: false }),
    item({ id: "pending-2", catalogId: null, catalogMatched: false }),
  ]);
  assert.equal(grouped.length, 2);
});
