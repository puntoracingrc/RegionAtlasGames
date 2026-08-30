import assert from "node:assert/strict";
import test from "node:test";
import { formatEsPriceForCard } from "./price-display";

const eur = (value: number | null) => (value == null ? "—" : `${value.toFixed(2)} €`);

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
