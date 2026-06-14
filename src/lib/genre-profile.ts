import { catalogGamePath } from "./catalog-url";
import { getPlatform } from "./catalog";
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
  count: number;
  games: CatalogGame[];
};

export type GenreProfileView = {
  slug: string;
  name: string;
  gameCount: number;
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
      count: platformGames.length,
      games: [...platformGames].sort((a, b) => a.title.localeCompare(b.title, "es")),
    }))
    .sort((a, b) => b.count - a.count || a.platformName.localeCompare(b.platformName, "es"));
}

export function buildGenreProfileView(slug: string): GenreProfileView | undefined {
  const entry = getGenre(slug);
  if (!entry) return undefined;
  const entity = getGenreEntity(entry.slug);
  const games = gamesForIndex(entry);
  return {
    slug: entry.slug,
    name: entry.name,
    gameCount: entry.gameCount,
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
