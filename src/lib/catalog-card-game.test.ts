import assert from "node:assert/strict";
import test from "node:test";
import { toCatalogCardGame } from "./catalog-card-game";
import type { CatalogListGame } from "./types";

test("toCatalogCardGame omite el indice interno y conserva lo visible", () => {
  const indexedGame: CatalogListGame = {
    id: "ps4-example",
    slug: "example",
    title: "Example",
    platformSlug: "ps4",
    region: "PAL España",
    coverUrl: "/example.jpg",
    recommendedPrice: 25,
    estimatedPriceLoose: 10,
    estimatedPriceGameManual: null,
    estimatedPriceComplete: 20,
    estimatedPriceSealed: 35,
    estimatedPriceNewRetail: 30,
    pcRefPrice: null,
    hasEsPrice: true,
    priceRegionVerified: true,
    displayPlatform: "PS4",
    displayYear: 2020,
    searchText: "example long internal index",
    gameSearchText: "example",
    companySearchText: "studio",
    companies: ["Studio"],
    sortGenre: "accion",
    sortReference: "CUSA-00001",
    genreSlugs: ["accion"],
    subgenreSlugs: ["aventura"],
    facetSlugs: ["narrativo"],
    isGrail: false,
    isTopSegment: true,
  };

  const card = toCatalogCardGame(indexedGame);

  assert.equal(card.title, "Example");
  assert.equal(card.estimatedPriceSealed, 35);
  assert.equal(card.estimatedPriceNewRetail, 30);
  assert.equal(card.isTopSegment, true);
  assert.equal("searchText" in card, false);
  assert.equal("companySearchText" in card, false);
  assert.equal("genreSlugs" in card, false);
});
