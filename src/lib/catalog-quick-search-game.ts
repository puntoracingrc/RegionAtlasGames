import { getPlatform } from "@/lib/catalog";
import { catalogBrowseAliases } from "@/lib/catalog-review-policy";
import { normalizeCatalogSearchParts } from "@/lib/catalog-search-normalize";
import { toCatalogListGameShell } from "@/lib/catalog-list-game-shell";
import type { CatalogGame, CatalogListGame } from "@/lib/types";

export function catalogGameSearchTextBase(game: CatalogGame): string {
  return normalizeCatalogSearchParts([
    game.title,
    game.titlePc,
    game.slug,
    game.id,
    ...catalogBrowseAliases(game.id),
    game.edition,
    game.museumSlug,
    game.museumRegion,
    game.pcPath,
    game.pcRegion,
    game.pcCondition,
    game.pcId,
    ...(game.canonicalSerials ?? []),
    ...(game.resolutionSerials ?? []),
  ]);
}

/** Search row for title, identifier, platform, region and catalog reference queries. */
export function toCatalogQuickSearchGame(game: CatalogGame): CatalogListGame {
  const platform = getPlatform(game.platformSlug);
  const searchText = normalizeCatalogSearchParts([
    game.title,
    game.titlePc,
    game.slug,
    game.id,
    ...catalogBrowseAliases(game.id),
    game.region,
    game.edition,
    game.museumSlug,
    game.museumRegion,
    game.pcPath,
    game.pcRegion,
    game.pcCondition,
    game.pcId,
    ...(game.canonicalSerials ?? []),
    ...(game.resolutionSerials ?? []),
    platform?.name,
    platform?.shortName,
    game.platformSlug,
  ]);
  return {
    ...toCatalogListGameShell(game),
    searchText,
    gameSearchText: searchText,
    companySearchText: "",
    companies: [],
    sortGenre: "\uffff",
    sortReference: game.slug || game.id,
    genreSlugs: [],
    subgenreSlugs: [],
    facetSlugs: [],
  };
}
