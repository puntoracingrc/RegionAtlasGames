import type { CatalogGame, CollectionItem } from "./types";

type PriceFields = Pick<
  CatalogGame | CollectionItem,
  "hasEsPrice" | "priceRegionVerified" | "marketMin" | "marketMax"
>;

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

export function formatEsPriceForCard(
  game: Pick<CatalogGame | CollectionItem, "hasEsPrice" | "priceRegionVerified" | "recommendedPrice">,
  formatEur: (n: number | null) => string,
): string {
  const status = esPriceDisplayLabel(game);
  if (status === "pending") return "Pendiente";
  if (status === "unverified") return "Sin verificar";
  return formatEur(game.recommendedPrice);
}
