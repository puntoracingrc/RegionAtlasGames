import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCatalogStagingGameTransition,
  catalogStagingScanWindow,
} from "./catalog-staging-storage";
import {
  parsePriceChartingGamePage,
  pickStagingGamesForEnrichment,
} from "./pricecharting-enrich";
import type { CatalogStagingGame } from "./catalog-staging-types";

function stagingGame(
  pcId: number,
  status: CatalogStagingGame["status"],
  unitCount: number,
): CatalogStagingGame {
  return {
    pcId,
    title: `Juego ${pcId}`,
    titlePc: null,
    platformSlug: "ps2",
    consoleName: "PlayStation 2",
    region: "PAL ES",
    inRetroCatalog: false,
    status,
    pcPath: `/game/playstation-2/juego-${pcId}`,
    pcPathGuess: null,
    pcRegion: null,
    coverUrl: null,
    coverSourceUrl: null,
    pcRefPrice: null,
    recommendedPrice: null,
    marketMin: null,
    marketMax: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    importCount: 1,
    userCount: 1,
    unitCount,
    userIds: ["test-user"],
    enrichedAt: null,
    enrichError: null,
    catalogId: null,
    promotedAt: null,
  };
}

test("catalog staging scan window wraps around without scanning the full index", () => {
  assert.deepEqual(catalogStagingScanWindow([10, 20, 30, 40], 3, 3), [40, 10, 20]);
  assert.deepEqual(catalogStagingScanWindow([10, 20, 30], -1, 2), [30, 10]);
  assert.deepEqual(catalogStagingScanWindow([10, 20], 0, 99), [10, 20]);
});

test("enrichment candidates exclude completed games and prioritize imported units", () => {
  const selected = pickStagingGamesForEnrichment(
    [
      stagingGame(1, "enriched", 50),
      stagingGame(2, "pending-catalog", 2),
      stagingGame(3, "pending-catalog", 8),
    ],
    2,
  );

  assert.deepEqual(selected.map((game) => game.pcId), [3, 2]);
});

test("staging index transitions update units and status without a full rebuild", () => {
  const pending = stagingGame(4, "pending-catalog", 2);
  const enriched = { ...pending, status: "enriched" as const, unitCount: 5 };
  const index = {
    updatedAt: "2026-01-01T00:00:00.000Z",
    pcIds: [4],
    byPlatform: {
      ps2: { games: 1, units: 2, pendingEnrich: 1, enriched: 0, promoted: 0 },
    },
  };

  applyCatalogStagingGameTransition(index, pending, enriched);
  assert.deepEqual(index.byPlatform.ps2, {
    games: 1,
    units: 5,
    pendingEnrich: 0,
    enriched: 1,
    promoted: 0,
  });
});

test("PriceCharting parser accepts only canonical game pages", () => {
  const parsed = parsePriceChartingGamePage(`
    <html>
      <head><link rel="canonical" href="https://www.pricecharting.com/game/pal-playstation-2/ico"></head>
      <body>
        <h1 id="product_name">ICO</h1>
        <div data-product-id="12345"></div>
        <img src="https://storage.googleapis.com/images.pricecharting.com/example/240.jpg">
      </body>
    </html>
  `);

  assert.deepEqual(parsed, {
    pcPath: "/game/pal-playstation-2/ico",
    productId: 12345,
    titlePc: "ICO",
    coverSourceUrl: "https://storage.googleapis.com/images.pricecharting.com/example/1600.jpg",
  });
  assert.equal(parsePriceChartingGamePage("<html>sin canonical</html>"), null);
});
