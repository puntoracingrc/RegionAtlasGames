import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionSummary } from "./collection-store";
import {
  buildCollectionValueTimeline,
  buildFavoritePlatforms,
  buildHomeCollectionSnapshot,
} from "./home-dashboard";
import type { CollectionView } from "./types";

function collectionItem(overrides: Partial<CollectionView>): CollectionView {
  return {
    id: "item-1",
    catalogId: "game-1",
    catalogMatched: true,
    inRetroCatalog: true,
    title: "Juego",
    titlePc: null,
    platformSlug: "ps4",
    region: "ES",
    sealed: false,
    collectionCondition: "complete",
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
    addedAt: "2026-01-01T00:00:00.000Z",
    hasEsPrice: true,
    coverUrl: null,
    pcId: null,
    ...overrides,
  };
}

const summary: CollectionSummary = {
  totalItems: 3,
  retroItems: 3,
  outOfScopeItems: 0,
  pendingCatalog: 0,
  totalUnits: 5,
  withEsPrice: 2,
  pendingEsPrice: 1,
  totalRecommendedValue: 90,
  totalBuyValue: 40,
};

test("favorite platforms count games and units independently", () => {
  const result = buildFavoritePlatforms([
    collectionItem({ id: "ps4-a" }),
    collectionItem({ id: "ps4-a-copy-2" }),
    collectionItem({ id: "ps4-b", catalogId: "game-2", quantity: 1 }),
    collectionItem({ id: "ps5-a", catalogId: "game-3", platformSlug: "ps5" }),
    collectionItem({ id: "ps5-a-copy-2", catalogId: "game-3", platformSlug: "ps5" }),
  ]);

  assert.deepEqual(result, [
    { slug: "ps4", label: "PS4", games: 2, units: 3, share: 60 },
    { slug: "ps5", label: "PS5", games: 1, units: 2, share: 40 },
  ]);
});

test("collection timeline respects added dates, condition prices and quantities", () => {
  const items = [
    collectionItem({ id: "complete", catalogId: "game-1", quantity: 2 }),
    collectionItem({
      id: "sealed",
      catalogId: "game-2",
      platformSlug: "ps5",
      sealed: true,
      collectionCondition: "sealed",
      addedAt: "2026-02-01T00:00:00.000Z",
    }),
  ];
  const history = {
    "game-1": [
      { at: "2026-01-10T00:00:00.000Z", loose: 5, complete: 10, sealed: 20 },
      { at: "2026-03-01T00:00:00.000Z", loose: 7, complete: 15, sealed: 25 },
    ],
    "game-2": [
      { at: "2026-02-10T00:00:00.000Z", loose: 12, complete: 18, sealed: 30 },
    ],
  };

  const result = buildCollectionValueTimeline(items, 65, {
    now: "2026-04-01T00:00:00.000Z",
    historyForGame: (catalogId) => history[catalogId as keyof typeof history] ?? [],
  });

  assert.deepEqual(
    result.map((point) => [point.at.slice(0, 10), point.value]),
    [
      ["2026-01-01", 0],
      ["2026-01-10", 20],
      ["2026-02-01", 20],
      ["2026-02-10", 50],
      ["2026-03-01", 60],
      ["2026-04-01", 65],
    ],
  );
});

test("home snapshot exposes coverage and newest collection items", () => {
  const items = [
    collectionItem({ id: "old", addedAt: "2026-01-01T00:00:00.000Z" }),
    collectionItem({ id: "new", catalogId: "game-2", addedAt: "2026-03-01T00:00:00.000Z" }),
    collectionItem({ id: "middle", catalogId: "game-3", addedAt: "2026-02-01T00:00:00.000Z" }),
  ];

  const result = buildHomeCollectionSnapshot(items, summary, {
    now: "2026-04-01T00:00:00.000Z",
    historyForGame: () => [],
  });

  assert.equal(result.priceCoveragePct, 67);
  assert.deepEqual(result.recentItems.map((item) => item.id), ["new", "middle", "old"]);
  assert.equal(result.valueHistory.at(-1)?.value, 90);
});

test("collection timeline keeps only the final value for each day", () => {
  const items = [
    collectionItem({ id: "first", catalogId: "game-1", addedAt: "2026-03-01T09:00:00.000Z" }),
    collectionItem({ id: "second", catalogId: "game-2", addedAt: "2026-03-01T18:00:00.000Z" }),
  ];

  const result = buildCollectionValueTimeline(items, 40, {
    now: "2026-03-01T20:00:00.000Z",
    historyForGame: () => [],
  });

  assert.deepEqual(result, [{ at: "2026-03-01T20:00:00.000Z", value: 40 }]);
});
