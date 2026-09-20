import { getCatalogGame } from "@/lib/catalog";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { catalogMarketRegionToLegacyRegion } from "@/lib/catalog-edition-guide-types";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { getPublishedPriceHistory } from "@/lib/price-history";
import { catalogPriceTrends } from "@/lib/price-history-model";
import { publicRegionLabelForPlatform } from "@/lib/platform-region-policy";
import { getRegionDisplay, sameRegionDisplayIdentity } from "@/lib/region-display";
import { regionNavigationGroup, selectedRegionGroup } from "@/lib/region-navigation";
import type { CatalogGame, CatalogListGame } from "@/lib/types";

function matchesSelectedRegion(game: CatalogGame, activeRegion: string): boolean {
  const legacyRegion = catalogMarketRegionToLegacyRegion(game.region);
  const publicRegion = publicRegionLabelForPlatform(game.platformSlug, legacyRegion);
  const group = selectedRegionGroup(activeRegion);
  if (group) return regionNavigationGroup(publicRegion) === group.id;
  return sameRegionDisplayIdentity(legacyRegion, activeRegion) ||
    sameRegionDisplayIdentity(getRegionDisplay(legacyRegion).label, activeRegion) ||
    sameRegionDisplayIdentity(publicRegion, activeRegion);
}

function regionalPriceSource(game: CatalogListGame, activeRegion: string): CatalogGame | undefined {
  const fallback = game.sourceCatalogGame ?? getCatalogGame(game.id);
  if (!game.physicalEditionGroup || activeRegion === "all") return fallback;
  return game.physicalEditionGroup.catalogIds
    .map((catalogId) => getCatalogGame(catalogId))
    .find((candidate): candidate is CatalogGame => Boolean(candidate && matchesSelectedRegion(candidate, activeRegion))) ?? fallback;
}

export function withRegionalCatalogPriceSource(
  game: CatalogListGame,
  activeRegion = "all",
  includeTrends = true,
): CatalogListGame | null {
  const source = regionalPriceSource(game, activeRegion);
  if (!source) return null;
  const sourceListGame = toCatalogListGame(source);
  return {
    ...game,
    region: sourceListGame.region,
    coverUrl: sourceListGame.coverUrl,
    recommendedPrice: sourceListGame.recommendedPrice,
    estimatedPriceLoose: sourceListGame.estimatedPriceLoose,
    estimatedPriceGameManual: sourceListGame.estimatedPriceGameManual,
    estimatedPriceComplete: sourceListGame.estimatedPriceComplete,
    estimatedPriceSealed: sourceListGame.estimatedPriceSealed,
    estimatedPriceNewRetail: sourceListGame.estimatedPriceNewRetail,
    pcRefPrice: sourceListGame.pcRefPrice,
    hasEsPrice: sourceListGame.hasEsPrice,
    priceRegionVerified: sourceListGame.priceRegionVerified,
    ...(includeTrends ? { priceTrends: catalogPriceTrends(getPublishedPriceHistory(source)) } : {}),
  };
}

/** Keeps the V2 central card while switching its visible prices to the selected regional release. */
export function toRegionalCatalogCardGame(
  game: CatalogListGame,
  activeRegion = "all",
): CatalogListGame | null {
  const regionalGame = withRegionalCatalogPriceSource(game, activeRegion);
  return regionalGame ? toCatalogCardGame(regionalGame) : null;
}

export function toRegionalCatalogCardGames(
  games: CatalogListGame[],
  activeRegion = "all",
): CatalogListGame[] {
  return games.flatMap((game) => {
    const card = toRegionalCatalogCardGame(game, activeRegion);
    return card ? [card] : [];
  });
}

/** Adds rich detail fields only to the catalog cards that will be rendered. */
export async function enrichCatalogCards(
  games: CatalogListGame[],
  activeRegion = "all",
): Promise<CatalogListGame[]> {
  return games.flatMap((game) => {
    const source = regionalPriceSource(game, activeRegion);
    if (!source) return [];
    const richGame = toCatalogListGame(source);
    const regionalGame = withRegionalCatalogPriceSource({
      ...richGame,
      id: game.id,
      slug: game.slug,
      title: game.title,
      physicalEditionGroup: game.physicalEditionGroup,
      isGrail: game.isGrail,
      isTopSegment: game.isTopSegment,
    }, activeRegion);
    return regionalGame ? [toCatalogCardGame(regionalGame)] : [];
  });
}
