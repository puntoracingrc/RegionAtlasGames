import type { CatalogListGame } from "@/lib/types";

/**
 * El navegador solo necesita los campos visibles de una tarjeta. El indice de
 * busqueda completo permanece en el servidor para filtrar y ordenar.
 */
export function toCatalogCardGame(game: CatalogListGame): CatalogListGame {
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    physicalVariant: game.physicalVariant,
    coverUrl: game.coverUrl,
    recommendedPrice: game.recommendedPrice,
    estimatedPriceLoose: game.estimatedPriceLoose,
    estimatedPriceGameManual: game.estimatedPriceGameManual,
    estimatedPriceComplete: game.estimatedPriceComplete,
    estimatedPriceSealed: game.estimatedPriceSealed,
    pcRefPrice: game.pcRefPrice,
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    displayPlatform: game.displayPlatform,
    displayYear: game.displayYear,
    isGrail: game.isGrail,
    isTopSegment: game.isTopSegment,
  };
}
