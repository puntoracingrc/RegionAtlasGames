import { getPlatform } from "./catalog";
import { isGrailGame, isTopInSegment } from "./game-highlight";
import type { CatalogGame, CatalogListGame } from "./types";

/**
 * Lightweight catalog row for initial pages that do not need the full search
 * taxonomy. Rich metadata is added only to the cards that will be rendered.
 */
export function toCatalogListGameShell(game: CatalogGame): CatalogListGame {
  const platform = getPlatform(game.platformSlug);
  return {
    sourceCatalogGame: game,
    id: game.id,
    slug: game.slug,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    regionalStatus: game.regionalStatus,
    ...(game.canonicalSeoSlug ? { canonicalSeoSlug: game.canonicalSeoSlug } : {}),
    physicalVariant: game.physicalVariant,
    coverUrl: game.coverUrl,
    recommendedPrice: game.recommendedPrice,
    estimatedPriceLoose: game.estimatedPriceLoose,
    estimatedPriceGameManual: game.estimatedPriceGameManual,
    estimatedPriceComplete: game.estimatedPriceComplete,
    estimatedPriceSealed: game.estimatedPriceSealed,
    estimatedPriceNewRetail: game.estimatedPriceNewRetail,
    pcRefPrice: game.pcRefPrice,
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    displayPlatform: platform?.shortName ?? game.platformSlug.toUpperCase(),
    displayYear: null,
    isGrail: isGrailGame(game),
    isTopSegment: isTopInSegment(game),
  };
}
