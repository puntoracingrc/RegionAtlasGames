import type { CatalogGame, CollectionItem } from "./types";
import { hasAnyConditionEstimate, primaryConditionPriceEntry } from "./condition-prices";

type PriceFields = Pick<
  CatalogGame | CollectionItem,
  "hasEsPrice" | "priceRegionVerified" | "marketMin" | "marketMax"
>;

type CatalogConditionPriceFields = Pick<
  CatalogGame | CollectionItem,
  "estimatedPriceSealed" | "estimatedPriceComplete" | "estimatedPriceLoose"
>;

export type CatalogConditionPriceRow = {
  condition: "sealed" | "complete" | "loose";
  label: "Precintado" | "Completo" | "Solo juego";
  price: number | null;
};

/** Los tres precios comparables que siempre aparecen en las vistas del catalogo. */
export function catalogConditionPriceRows(
  game: CatalogConditionPriceFields,
): CatalogConditionPriceRow[] {
  return [
    { condition: "sealed", label: "Precintado", price: game.estimatedPriceSealed ?? null },
    { condition: "complete", label: "Completo", price: game.estimatedPriceComplete ?? null },
    { condition: "loose", label: "Solo juego", price: game.estimatedPriceLoose ?? null },
  ];
}

/** Precio ES fiable: existe y la región de los anuncios fuente quedó verificada. */
export function hasVerifiedEsPrice(
  game: Pick<CatalogGame | CollectionItem, "hasEsPrice" | "priceRegionVerified">,
): boolean {
  return game.hasEsPrice === true && game.priceRegionVerified === true;
}

/** Rango min–máx solo válido tras sync P2P con región verificada. */
export function hasVerifiedEsPriceRange(game: PriceFields): boolean {
  return (
    hasVerifiedEsPrice(game) &&
    game.marketMin != null &&
    game.marketMax != null &&
    game.marketMin <= game.marketMax
  );
}

export function esPriceDisplayLabel(
  game: Pick<CatalogGame | CollectionItem, "hasEsPrice" | "priceRegionVerified">,
): "verified" | "unverified" | "pending" {
  if (!game.hasEsPrice) return "pending";
  if (game.priceRegionVerified === true) return "verified";
  return "unverified";
}

/** Estado visible del precio: conserva la verificación ES y admite referencias externas orientativas. */
export function catalogPriceDisplayLabel(
  game: Pick<
    CatalogGame | CollectionItem,
    | "hasEsPrice"
    | "priceRegionVerified"
    | "recommendedPrice"
    | "pcRefPrice"
    | "estimatedPriceLoose"
    | "estimatedPriceGameManual"
    | "estimatedPriceComplete"
    | "estimatedPriceSealed"
    | "estimatedPriceNewRetail"
  >,
): "verified" | "unverified" | "pending" {
  const esStatus = esPriceDisplayLabel(game);
  if (esStatus !== "pending") return esStatus;
  if (hasAnyConditionEstimate(game) || game.recommendedPrice != null || game.pcRefPrice != null) {
    return "unverified";
  }
  return "pending";
}

export function formatEsPriceForCard(
  game: Pick<
    CatalogGame | CollectionItem,
    | "hasEsPrice"
    | "priceRegionVerified"
    | "recommendedPrice"
    | "estimatedPriceLoose"
    | "estimatedPriceGameManual"
    | "estimatedPriceComplete"
    | "estimatedPriceSealed"
    | "estimatedPriceNewRetail"
  >,
  formatEur: (n: number | null) => string,
): string {
  const status = esPriceDisplayLabel(game);
  if (status === "pending") return "Pendiente";
  const conditionPrice = primaryConditionPriceEntry(game);
  if (hasAnyConditionEstimate(game) && conditionPrice) {
    return `${conditionPrice.shortLabel} · ${formatEur(conditionPrice.price)}`;
  }
  if (status === "unverified" && game.recommendedPrice == null) return "Sin dato";
  return formatEur(game.recommendedPrice);
}
