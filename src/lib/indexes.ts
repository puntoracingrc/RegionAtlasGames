import companiesData from "../../data/index/companies.json";
import genresData from "../../data/index/genres.json";
import seriesData from "../../data/index/series.json";
import gameDetailsData from "../../data/game-details.json";
import type { CatalogGame, GameDetails, IndexEntry } from "./types";
import { getCatalogGame, getPlatform, meta } from "./catalog";

/** Índices precalculados (data/index/*.json). Regenerar con npm run details:indexes. */

function isGameDetails(value: unknown): value is GameDetails {
  if (!value || typeof value !== "object") return false;
  if ("error" in value) return false;
  const detail = value as GameDetails;
  if (detail.description?.trim()) return true;
  if (!("fetchedAt" in value)) return false;
  return Boolean(
    detail.developer ||
      detail.publisher ||
      (detail.genres?.length ?? 0) > 0 ||
      detail.reference ||
      detail.year,
  );
}

let gameDetailsCache: Record<string, GameDetails> | null = null;

function loadGameDetails(): Record<string, GameDetails> {
  if (gameDetailsCache) return gameDetailsCache;
  const raw = gameDetailsData as Record<string, unknown>;
  gameDetailsCache = Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, GameDetails] =>
      isGameDetails(entry[1]),
    ),
  );
  return gameDetailsCache;
}

export const companies = companiesData as Record<string, IndexEntry>;
export const genres = genresData as Record<string, IndexEntry>;
export const seriesIndex = seriesData as Record<string, IndexEntry>;

const companyList = Object.values(companies).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const genreList = Object.values(genres).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const seriesList = Object.values(seriesIndex).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);

/** Recalcula contadores desde el catálogo listado actual. */
export function resolveIndexEntry(entry: IndexEntry): IndexEntry {
  const games = entry.gameIds
    .map((id) => getCatalogGame(id))
    .filter((g): g is CatalogGame => Boolean(g));
  const gameIds = games.map((g) => g.id);
  const byPlatform: Record<string, number> = {};
  for (const game of games) {
    byPlatform[game.platformSlug] = (byPlatform[game.platformSlug] ?? 0) + 1;
  }

  const resolved: IndexEntry = {
    ...entry,
    gameIds,
    gameCount: gameIds.length,
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };

  if (entry.asDeveloper) {
    resolved.asDeveloper = entry.asDeveloper.filter((id) => gameIds.includes(id));
  }
  if (entry.asPublisher) {
    resolved.asPublisher = entry.asPublisher.filter((id) => gameIds.includes(id));
  }

  return resolved;
}

export function getGameDetails(id: string): GameDetails | undefined {
  return loadGameDetails()[id];
}

export function getCompany(slug: string): IndexEntry | undefined {
  const entry = companies[slug];
  return entry ? resolveIndexEntry(entry) : undefined;
}

export function getGenre(slug: string): IndexEntry | undefined {
  const entry = genres[slug];
  return entry ? resolveIndexEntry(entry) : undefined;
}

export function getSeries(slug: string): IndexEntry | undefined {
  const entry = seriesIndex[slug];
  return entry ? resolveIndexEntry(entry) : undefined;
}

export function getCompanies(): IndexEntry[] {
  return companyList;
}

export function getGenres(): IndexEntry[] {
  return genreList;
}

export function getSeriesList(): IndexEntry[] {
  return seriesList;
}

export function gamesForIndex(entry: IndexEntry): CatalogGame[] {
  return resolveIndexEntry(entry).gameIds
    .map((id) => getCatalogGame(id))
    .filter((g): g is CatalogGame => Boolean(g));
}

export function indexStats() {
  return {
    companies: meta.indexCompanies ?? companyList.length,
    genres: meta.indexGenres ?? genreList.length,
    series: seriesList.length,
    gamesWithDetails: meta.gamesWithDetails ?? 0,
  };
}

export function platformBreakdown(entry: IndexEntry) {
  return Object.entries(resolveIndexEntry(entry).byPlatform)
    .map(([slug, count]) => ({
      slug,
      count,
      name: getPlatform(slug)?.shortName ?? slug,
    }))
    .sort((a, b) => b.count - a.count);
}

/** @deprecated usar getGameDetails */
export function getGameDetailsRecord(): Record<string, GameDetails> {
  return loadGameDetails();
}
