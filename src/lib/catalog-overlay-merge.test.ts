import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCatalogGameWithOverlay,
  mergeCatalogPlatformGames,
  resolveCatalogOverlayCandidate,
} from "./catalog-overlay-merge";
import type { CatalogGame } from "./types";

function game(id: string, title: string, platformSlug = "nes"): CatalogGame {
  return {
    id,
    slug: id,
    title,
    titlePc: null,
    platformSlug,
    region: "PAL Europa",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
    pcId: null,
    pcRegion: null,
    pcCondition: null,
    matchConfidence: null,
    marketMin: null,
    marketMax: null,
    recommendedPrice: null,
    pcRefPrice: null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: null,
    hasEsPrice: false,
  };
}

test("an overlay registered for a static id takes precedence", () => {
  const staticGame = game("nes-pal-mario", "Mario");
  assert.equal(
    resolveCatalogOverlayCandidate("nes-pal-mario", staticGame, [staticGame.id], {}),
    staticGame.id,
  );
});

test("an overlay SEO slug resolves even when there is no static game", () => {
  assert.equal(
    resolveCatalogOverlayCandidate("mario-pal-europa", undefined, ["nes-pal-mario"], {
      "mario-pal-europa": "nes-pal-mario",
    }),
    "nes-pal-mario",
  );
});

test("platform overlays replace static games with the same id", () => {
  const staticMario = game("nes-pal-mario", "Mario");
  const overlayMario = { ...staticMario, title: "Super Mario Bros.", recommendedPrice: 42 };
  const merged = mergeCatalogPlatformGames("nes", [staticMario, game("nes-pal-zelda", "Zelda")], [
    overlayMario,
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((entry) => entry.id === staticMario.id)?.recommendedPrice, 42);
  assert.equal(merged.find((entry) => entry.id === staticMario.id)?.title, "Super Mario Bros.");
});

test("a newer static TodoConsolas reference survives a stale runtime overlay", () => {
  const staticGame = {
    ...game("ps4-pal-mario", "Mario", "ps4"),
    tcnsRetailPrice: 19.95,
    tcnsProductUrl: "https://www.todoconsolas.com/mario.html",
    tcnsCondition: "preowned",
    tcnsMatchedAt: "2026-08-29T10:00:00Z",
  };
  const overlayGame = {
    ...game("ps4-pal-mario", "Mario antiguo", "ps4"),
    recommendedPrice: 35,
  };

  const merged = mergeCatalogGameWithOverlay(staticGame, overlayGame);

  assert.equal(merged.title, "Mario antiguo");
  assert.equal(merged.recommendedPrice, 35);
  assert.equal(merged.tcnsRetailPrice, 19.95);
  assert.equal(merged.tcnsProductUrl, "https://www.todoconsolas.com/mario.html");
  assert.equal(merged.tcnsCondition, "preowned");
  assert.equal(merged.tcnsMatchedAt, "2026-08-29T10:00:00Z");
});

test("a newer runtime TodoConsolas reference still takes precedence", () => {
  const staticGame = {
    ...game("ps4-pal-mario", "Mario", "ps4"),
    tcnsRetailPrice: 19.95,
    tcnsMatchedAt: "2026-08-29T10:00:00Z",
  };
  const overlayGame = {
    ...staticGame,
    tcnsRetailPrice: 24.95,
    tcnsProductUrl: "https://www.todoconsolas.com/mario-new.html",
    tcnsMatchedAt: "2026-08-29T11:00:00Z",
  };

  const merged = mergeCatalogGameWithOverlay(staticGame, overlayGame);

  assert.equal(merged.tcnsRetailPrice, 24.95);
  assert.equal(merged.tcnsProductUrl, "https://www.todoconsolas.com/mario-new.html");
  assert.equal(merged.tcnsMatchedAt, "2026-08-29T11:00:00Z");
});

test("an overlay moved to another platform removes the stale static entry", () => {
  const staticGame = game("nes-pal-mario", "Mario");
  const movedOverlay = { ...staticGame, platformSlug: "snes" };

  assert.deepEqual(mergeCatalogPlatformGames("nes", [staticGame], [movedOverlay]), []);
});
