import assert from "node:assert/strict";
import test from "node:test";
import { loadCollectionPriceData } from "./collection-runtime-prices";
import { summarizeCollection } from "./collection-store";
import { buildHomeCollectionSnapshot } from "./home-dashboard";
import type { CatalogGame, CollectionItem } from "./types";
import type { PriceConnectorGame } from "./direct-price-connector";

function item(id: string, catalogId: string, sealed = false): CollectionItem {
  return {
    id, catalogId, title: id, platformSlug: "ps4", region: catalogId === "us" ? "USA" : "PAL España",
    catalogMatched: true, inRetroCatalog: true, sealed, collectionCondition: sealed ? "sealed" : "complete",
    quantity: 1, buyPrice: 12, ownerEstimatedPrice: 777, previousSalePrice: 11,
    recommendedPrice: 1, totalValue: 1, hasEsPrice: false, notes: "personal",
    addedAt: "2026-09-01T00:00:00Z",
  } as CollectionItem;
}

test("current regional/state values feed collection cards, total, coverage and final graph point", async () => {
  const items = [item("open", "es"), item("sealed", "es", true), item("usa", "us")];
  items[0].quantity = 2;
  const saved = structuredClone(items);
  const games: Record<string, CatalogGame> = {
    es: { id: "es", title: "ES", estimatedPriceComplete: 70, estimatedPriceSealed: 100, estimatedTotalToSpainComplete: 73 } as CatalogGame,
    us: { id: "us", title: "USA", estimatedPriceComplete: 20 } as CatalogGame,
  };
  const calls: string[] = [];
  const data = await loadCollectionPriceData(items, async id => { calls.push(id); return games[id]; });
  assert.deepEqual(calls.sort(), ["es", "us"]);
  assert.deepEqual(data.items.map(row => row.totalValue), [140, 100, 20]);
  assert.deepEqual(data.items.map(row => row.recommendedPrice), [70, 100, 20]);
  const summary = summarizeCollection(data.items);
  const home = buildHomeCollectionSnapshot(data.items, summary, {
    now: "2026-09-20T00:00:00Z", historyForItem: row => data.historyByItemId.get(row.id) ?? [],
  });
  assert.equal(summary.totalRecommendedValue, 260);
  assert.equal(home.priceCoveragePct, 100);
  assert.equal(home.valueHistory.at(-1)?.value, 260);
  assert.deepEqual(items, saved);
  for (const row of data.items) {
    assert.equal(row.buyPrice, 12);
    assert.equal(row.ownerEstimatedPrice, 777);
    assert.equal(row.previousSalePrice, 11);
    assert.equal(row.notes, "personal");
  }
});

test("receipt history is private server data and independent publications carry the previous other state", async () => {
  const game: PriceConnectorGame = { ...({ id: "es", title: "ES", estimatedPriceComplete: 70, estimatedPriceSealed: 100 } as CatalogGame),
    priceConnectorReceipts: [
      { catalogId: "es", batchId: "one", digest: "x", taskId: "t", publishedAt: "2026-09-18T00:00:00Z", conditions: [{ state: "complete", before: 65, mean: 75, after: 70, listings: [] }] },
      { catalogId: "es", batchId: "two", digest: "y", taskId: "t", publishedAt: "2026-09-19T00:00:00Z", conditions: [{ state: "sealed", before: null, mean: 100, after: 100, listings: [] }] },
    ],
  };
  const data = await loadCollectionPriceData([item("open", "es"), item("sealed", "es", true)], async () => game);
  const home = buildHomeCollectionSnapshot(data.items, summarizeCollection(data.items), {
    now: "2026-09-20T00:00:00Z", historyForItem: row => data.historyByItemId.get(row.id) ?? [],
  });
  assert.equal(home.valueHistory.find(point => point.at.startsWith("2026-09-19"))?.value, 170);
  assert.equal(JSON.stringify(data.items).includes("priceConnectorReceipts"), false);
});
