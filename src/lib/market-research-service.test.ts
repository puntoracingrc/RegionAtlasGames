import assert from "node:assert/strict";
import test from "node:test";
import { findRegionalVariant } from "./market-research-service";
import type { CatalogGame } from "./types";

function game(id: string, region: string, slug = "game"): CatalogGame {
  return {
    id,
    slug,
    title: "Game",
    titlePc: "Game",
    platformSlug: "snes",
    region,
    edition: "standard",
    coverUrl: null,
    pcId: null,
    pcPath: null,
    pcRegion: null,
    pcCondition: null,
    matchConfidence: null,
    marketMin: null,
    marketMax: null,
    recommendedPrice: null,
    pcRefPrice: null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: "2026-08-27",
    hasEsPrice: false,
    listingStatus: "listed",
  };
}

test("routes a USA listing to the existing USA regional variant", () => {
  const origin = game("snes-pal-game", "PAL España");
  const usa = game("snes-usa-game", "USA");
  const japan = game("snes-japon-game", "Japón");
  assert.equal(findRegionalVariant(origin, [origin, usa, japan], "USA")?.id, usa.id);
  assert.equal(findRegionalVariant(origin, [origin, usa, japan], "Japón")?.id, japan.id);
});

test("does not guess when two regional candidates are ambiguous", () => {
  const origin = game("snes-pal-game", "PAL España", "game-pal");
  const first = game("snes-usa-game-a", "USA", "game-a");
  const second = game("snes-usa-game-b", "USA", "game-b");
  assert.equal(findRegionalVariant(origin, [origin, first, second], "USA"), null);
});
