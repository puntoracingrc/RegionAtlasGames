import gameDetailsData from "../../data/game-details.json";
import type { CatalogGame, DetailEntity, GameDetails, IndexEntry } from "./types";
import { getCatalogGame, getPlatform, listedCatalog } from "./catalog";

/**
 * Índices cruzados (compañías, géneros, sagas) calculados desde catálogo + game-details.
 * Aplica a todas las entidades del museo: si un juego sale del catálogo, los contadores bajan solos.
 */

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

type IndexBucket = Record<string, IndexEntry>;

function entityIndexPath(entity: DetailEntity): string {
  return entity.museumPath ?? entity.pcPath ?? "";
}

function bumpEntity(
  bucket: IndexBucket,
  entity: DetailEntity | null | undefined,
  game: CatalogGame,
  role?: "developer" | "publisher",
): void {
  if (!entity?.name) return;
  const slug = entity.slug || entity.name.toLowerCase().replace(/\s+/g, "-");

  const entry =
    bucket[slug] ??
    (bucket[slug] = {
      name: entity.name,
      slug,
      museumPath: entityIndexPath(entity),
      gameIds: [],
      byPlatform: {},
      gameCount: 0,
      ...(role ? { asDeveloper: [], asPublisher: [] } : {}),
    });

  if (!entry.museumPath && entityIndexPath(entity)) {
    entry.museumPath = entityIndexPath(entity);
  }

  if (!entry.gameIds.includes(game.id)) {
    entry.gameIds.push(game.id);
    entry.byPlatform[game.platformSlug] = (entry.byPlatform[game.platformSlug] ?? 0) + 1;
  }

  if (role === "developer") {
    if (!entry.asDeveloper!.includes(game.id)) entry.asDeveloper!.push(game.id);
  }
  if (role === "publisher") {
    if (!entry.asPublisher!.includes(game.id)) entry.asPublisher!.push(game.id);
  }
}

function finalizeBucket(bucket: IndexBucket): IndexBucket {
  for (const entry of Object.values(bucket)) {
    entry.gameCount = entry.gameIds.length;
    entry.byPlatform = Object.fromEntries(
      Object.entries(entry.byPlatform).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return bucket;
}

function sortEntries(bucket: IndexBucket): IndexEntry[] {
  return Object.values(bucket).sort(
    (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
  );
}

/** Recalcula contadores desde el catálogo listado actual (todas las compañías/géneros/sagas). */
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

function buildIndexes(): {
  companies: IndexBucket;
  genres: IndexBucket;
  series: IndexBucket;
  companyList: IndexEntry[];
  genreList: IndexEntry[];
  seriesList: IndexEntry[];
  gamesWithDetails: number;
} {
  const details = loadGameDetails();
  const companies: IndexBucket = {};
  const genres: IndexBucket = {};
  const series: IndexBucket = {};
  let gamesWithDetails = 0;

  for (const game of listedCatalog) {
    const detail = details[game.id];
    if (!detail) continue;

    gamesWithDetails += 1;
    bumpEntity(companies, detail.developer, game, "developer");
    bumpEntity(companies, detail.publisher, game, "publisher");
    for (const genre of detail.genres ?? []) {
      bumpEntity(genres, genre, game);
    }
    bumpEntity(series, detail.series, game);
  }

  finalizeBucket(companies);
  finalizeBucket(genres);
  finalizeBucket(series);

  return {
    companies,
    genres,
    series,
    companyList: sortEntries(companies),
    genreList: sortEntries(genres),
    seriesList: sortEntries(series),
    gamesWithDetails,
  };
}

const indexCache = buildIndexes();

export const companies = indexCache.companies;
export const genres = indexCache.genres;
export const seriesIndex = indexCache.series;

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
  return indexCache.companyList.map(resolveIndexEntry);
}

export function getGenres(): IndexEntry[] {
  return indexCache.genreList.map(resolveIndexEntry);
}

export function getSeriesList(): IndexEntry[] {
  return indexCache.seriesList.map(resolveIndexEntry);
}

export function gamesForIndex(entry: IndexEntry): CatalogGame[] {
  return resolveIndexEntry(entry).gameIds
    .map((id) => getCatalogGame(id))
    .filter((g): g is CatalogGame => Boolean(g));
}

export function indexStats() {
  const companyList = getCompanies();
  const genreList = getGenres();
  const seriesList = getSeriesList();
  return {
    companies: companyList.length,
    genres: genreList.length,
    series: seriesList.length,
    gamesWithDetails: indexCache.gamesWithDetails,
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
