import { getPlatform } from "@/lib/catalog";
import { catalogSearchAliasesForDetailEntity, catalogSearchAliasesForGenre } from "@/lib/catalog-search-aliases";
import { normalizeCatalogSearchParts } from "@/lib/catalog-search-normalize";
import { isGrailGame, isTopInSegment } from "@/lib/game-highlight";
import { normalizeReference, referenceSortKey } from "@/lib/game-product-reference";
import { getGameDetails } from "@/lib/indexes";
import { resolveCanonicalGenreEntity } from "@/lib/genre-canonical";
import type { CatalogGame, CatalogListGame } from "@/lib/types";

export function toCatalogListGame(game: CatalogGame): CatalogListGame {
  const details = getGameDetails(game.id);
  const platform = getPlatform(game.platformSlug);
  const firstGenre = details?.genres?.[0];
  const canonicalGenre = firstGenre ? resolveCanonicalGenreEntity(firstGenre) : null;
  const facetSearchEntities = [
    ...(details?.subgenres ?? []),
    ...(details?.facets ?? []),
    ...(details?.tags ?? []),
  ];
  const normalizedReference = details?.reference ? normalizeReference(details.reference) : null;
  const sortReference = referenceSortKey(game, details);

  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    coverUrl: game.coverUrl,
    recommendedPrice: game.recommendedPrice,
    estimatedPriceLoose: game.estimatedPriceLoose,
    estimatedPriceGameManual: game.estimatedPriceGameManual,
    estimatedPriceComplete: game.estimatedPriceComplete,
    estimatedPriceSealed: game.estimatedPriceSealed,
    pcRefPrice: game.pcRefPrice,
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    displayPlatform: platform?.shortName ?? game.platformSlug.toUpperCase(),
    displayYear: details?.year ?? null,
    searchText: normalizeCatalogSearchParts([
      game.title,
      game.titlePc,
      game.slug,
      game.id,
      game.region,
      game.edition,
      game.museumSlug,
      game.museumRegion,
      platform?.name,
      platform?.shortName,
      game.platformSlug,
      game.pcPath,
      game.pcRegion,
      game.pcCondition,
      game.pcId,
      details?.reference,
      normalizedReference,
      normalizedReference?.replace(/-/g, ""),
      sortReference,
      details?.developer?.name,
      details?.developer?.slug,
      details?.publisher?.name,
      details?.publisher?.slug,
      details?.series?.name,
      details?.series?.slug,
      ...(details?.genres?.map((genre) => `${genre.name} ${genre.slug}`) ?? []),
      ...((details?.genres ?? []).flatMap((genre) => catalogSearchAliasesForGenre(resolveCanonicalGenreEntity(genre)))),
      ...facetSearchEntities.map((entity) => `${entity.name} ${entity.slug}`),
      ...facetSearchEntities.flatMap((entity) => catalogSearchAliasesForDetailEntity(entity)),
      canonicalGenre ? `${canonicalGenre.name} ${canonicalGenre.slug}` : null,
      ...(canonicalGenre ? catalogSearchAliasesForGenre(canonicalGenre) : []),
    ]),
    sortGenre: canonicalGenre?.name.toLowerCase() ?? "\uffff",
    sortReference,
    isGrail: isGrailGame(game),
    isTopSegment: isTopInSegment(game),
  };
}
