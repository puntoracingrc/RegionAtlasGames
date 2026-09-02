import assert from "node:assert/strict";
import test from "node:test";
import {
  PRICE_TYPE_OPTIONS,
  catalogPriceTypeOptions,
  normalizeCatalogPriceTypeForPlatform,
  sortCatalogListGames,
} from "./catalog-filters";
import {
  catalogConditionPriceRows,
  catalogPriceDisplayLabel,
  formatEsPriceForCard,
} from "./price-display";
import type { CatalogListGame } from "./types";

const eur = (value: number | null) => (value == null ? "—" : `${value.toFixed(2)} €`);

test("keeps the three catalog condition prices in a fixed order and preserves gaps", () => {
  assert.deepEqual(
    catalogConditionPriceRows({
      estimatedPriceSealed: 42,
      estimatedPriceComplete: null,
      estimatedPriceLoose: 11,
    }),
    [
      { condition: "sealed", label: "Precintado", price: 42 },
      { condition: "complete", label: "Completo", price: null },
      { condition: "loose", label: "Solo juego", price: 11 },
    ],
  );
});

test("shows an orientative condition price instead of hiding it as unverified", () => {
  assert.equal(
    formatEsPriceForCard(
      {
        hasEsPrice: true,
        priceRegionVerified: false,
        recommendedPrice: 13.5,
        estimatedPriceComplete: 13.5,
      },
      eur,
    ),
    "Completo · 13.50 €",
  );
});

test("keeps pending when no Spanish market price exists", () => {
  assert.equal(
    formatEsPriceForCard(
      {
        hasEsPrice: false,
        priceRegionVerified: false,
        recommendedPrice: null,
      },
      eur,
    ),
    "Pendiente",
  );
});

test("shows PriceCharting condition estimates as orientative outside Spain", () => {
  assert.equal(
    catalogPriceDisplayLabel({
      hasEsPrice: false,
      priceRegionVerified: false,
      recommendedPrice: 56.36,
      pcRefPrice: 56.36,
      estimatedPriceSealed: 129.42,
      estimatedPriceComplete: 56.36,
      estimatedPriceLoose: 12.94,
    }),
    "unverified",
  );
});

test("offers sealed as a catalog condition and sorts by its own price", () => {
  assert.deepEqual(
    PRICE_TYPE_OPTIONS.map((option) => option.value),
    ["recommended", "sealed", "newRetail", "complete", "gameManual", "loose"],
  );

  const games = [
    { id: "without-sealed", title: "Without sealed", estimatedPriceSealed: null },
    { id: "higher-sealed", title: "Higher sealed", estimatedPriceSealed: 45 },
    { id: "lower-sealed", title: "Lower sealed", estimatedPriceSealed: 20 },
  ] as CatalogListGame[];

  assert.deepEqual(
    sortCatalogListGames(games, "price-desc", "sealed").map((game) => game.id),
    ["higher-sealed", "lower-sealed", "without-sealed"],
  );
});

test("sorts recommended prices even when their Spanish region is not verified", () => {
  const games = [
    {
      id: "missing-price",
      title: "Missing price",
      recommendedPrice: null,
      estimatedPriceComplete: null,
    },
    {
      id: "higher-orientative",
      title: "Higher orientative",
      hasEsPrice: false,
      priceRegionVerified: false,
      recommendedPrice: 45,
    },
    {
      id: "condition-fallback",
      title: "Condition fallback",
      hasEsPrice: false,
      priceRegionVerified: false,
      recommendedPrice: null,
      estimatedPriceComplete: 30,
    },
    {
      id: "lower-verified",
      title: "Lower verified",
      hasEsPrice: true,
      priceRegionVerified: true,
      recommendedPrice: 20,
    },
  ] as CatalogListGame[];

  assert.deepEqual(
    sortCatalogListGames(games, "price-desc", "recommended").map((game) => game.id),
    ["higher-orientative", "condition-fallback", "lower-verified", "missing-price"],
  );
  assert.deepEqual(
    sortCatalogListGames(games, "price-asc", "recommended").map((game) => game.id),
    ["lower-verified", "condition-fallback", "higher-orientative", "missing-price"],
  );
});

test("offers only condition prices compatible with each platform medium", () => {
  assert.deepEqual(
    catalogPriceTypeOptions("ps3").map((option) => option.value),
    ["recommended", "sealed", "newRetail", "complete", "loose"],
  );
  assert.deepEqual(
    catalogPriceTypeOptions("n64").map((option) => option.value),
    ["recommended", "sealed", "newRetail", "complete", "gameManual", "loose"],
  );
  assert.equal(
    catalogPriceTypeOptions("ps3").find((option) => option.value === "loose")?.label,
    "Solo juego",
  );
  assert.equal(normalizeCatalogPriceTypeForPlatform("gameManual", "ps3"), "recommended");
});

test("keeps new retail separate from sealed and exposes its own catalog sort", () => {
  assert.equal(
    formatEsPriceForCard(
      {
        hasEsPrice: true,
        priceRegionVerified: false,
        recommendedPrice: 19.95,
        estimatedPriceNewRetail: 19.95,
      },
      eur,
    ),
    "Nuevo · 19.95 €",
  );

  const games = [
    { id: "sealed-only", title: "Sealed", estimatedPriceSealed: 10 },
    { id: "higher-retail", title: "Higher", estimatedPriceNewRetail: 30 },
    { id: "lower-retail", title: "Lower", estimatedPriceNewRetail: 20 },
  ] as CatalogListGame[];

  assert.deepEqual(
    sortCatalogListGames(games, "price-desc", "newRetail").map((game) => game.id),
    ["higher-retail", "lower-retail", "sealed-only"],
  );
});
