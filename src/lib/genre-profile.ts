import { catalogGamePath } from "./catalog-url";
import { getPlatform, isPublicCatalogGame } from "./catalog";
import {
  formatGenreAliases,
  getGenreEntity,
  resolveCanonicalGenreSlug,
} from "./genre-canonical";
import { gamesForIndex, getGenre } from "./indexes";
import { getGenreReferenceTops, type GenrePlatformReferenceTop } from "./genre-tops";
import type { CatalogGame } from "./types";

export type GenrePlatformGames = {
  platformSlug: string;
  platformName: string;
  catalogEntryCount: number;
  games: CatalogGame[];
};

export type GenreProfileView = {
  slug: string;
  name: string;
  catalogEntryCount: number;
  alsoKnownAs: string[];
  platforms: GenrePlatformGames[];
  referenceTops: GenrePlatformReferenceTop[];
  games: CatalogGame[];
};

function groupGamesByPlatform(games: CatalogGame[]): GenrePlatformGames[] {
  const buckets = new Map<string, CatalogGame[]>();
  for (const game of games) {
    const list = buckets.get(game.platformSlug) ?? [];
    list.push(game);
    buckets.set(game.platformSlug, list);
  }
  return [...buckets.entries()]
    .map(([platformSlug, platformGames]) => ({
      platformSlug,
      platformName: getPlatform(platformSlug)?.shortName ?? platformSlug,
      catalogEntryCount: platformGames.length,
      games: [...platformGames].sort((a, b) => a.title.localeCompare(b.title, "es")),
    }))
    .sort(
      (a, b) =>
        b.catalogEntryCount - a.catalogEntryCount ||
        a.platformName.localeCompare(b.platformName, "es"),
    );
}

export function buildGenreProfileView(slug: string): GenreProfileView | undefined {
  const entry = getGenre(slug);
  if (!entry) return undefined;
  const entity = getGenreEntity(entry.slug);
  const games = gamesForIndex(entry).filter(isPublicCatalogGame);
  return {
    slug: entry.slug,
    name: entry.name,
    catalogEntryCount: games.length,
    alsoKnownAs: formatGenreAliases(entity),
    platforms: groupGamesByPlatform(games),
    referenceTops: getGenreReferenceTops(entry.slug),
    games,
  };
}

export function genreGameHref(game: CatalogGame): string {
  return catalogGamePath(game);
}

export function resolveGenrePageSlug(slug: string, name?: string): string {
  return resolveCanonicalGenreSlug(slug, { name });
}
