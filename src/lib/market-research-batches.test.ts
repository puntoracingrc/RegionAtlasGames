import assert from "node:assert/strict";
import test from "node:test";
import { selectMarketResearchTargets } from "./market-research-batches";
import type { CatalogGame } from "./types";

function game(id: string, input: { region?: string; price?: number | null; cover?: string | null } = {}): CatalogGame {
  return {
    id,
    slug: id,
    title: id,
    titlePc: id,
    platformSlug: "ps2",
    region: input.region ?? "PAL España",
    edition: "standard",
    coverUrl: input.cover ?? null,
    pcId: null,
    pcPath: null,
    pcRegion: null,
    pcCondition: null,
    matchConfidence: null,
    marketMin: null,
    marketMax: null,
    recommendedPrice: input.price ?? null,
    pcRefPrice: null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: "2026-08-27",
    hasEsPrice: input.price != null,
    listingStatus: "listed",
  };
}

test("prioritizes games missing both price and cover", () => {
  const selected = selectMarketResearchTargets({
    games: [
      game("with-both", { price: 20, cover: "/cover.jpg" }),
      game("missing-price", { cover: "/cover.jpg" }),
      game("missing-both"),
    ],
    mode: "missing_any",
    limit: 2,
  });
  assert.deepEqual(selected.map((item) => item.id), ["missing-both", "missing-price"]);
});

test("keeps each region as an independent selectable target", () => {
  const selected = selectMarketResearchTargets({
    games: [game("game-es"), game("game-usa", { region: "USA" }), game("game-jp", { region: "Japón" })],
    mode: "missing_price",
    region: "USA",
    limit: 10,
  });
  assert.deepEqual(selected.map((item) => item.id), ["game-usa"]);
});

test("does not enqueue a game whose only estimate is new retail", () => {
  const retailOnly = {
    ...game("retail-only"),
    estimatedPriceNewRetail: 19.95,
  };
  const selected = selectMarketResearchTargets({
    games: [retailOnly, game("missing-price")],
    mode: "missing_price",
    limit: 10,
  });
  assert.deepEqual(selected.map((item) => item.id), ["missing-price"]);
});
