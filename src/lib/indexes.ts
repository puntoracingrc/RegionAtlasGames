import { readFileSync } from "fs";
import path from "path";
import seriesIndexData from "../../data/index/series.json";
import { mergeCompanyIndex, resolveCanonicalCompanySlug } from "./company-canonical";
import { mergeGenreIndex, resolveCanonicalGenreSlug } from "./genre-canonical";
import { normalizeGameDetailsPresentation } from "./catalog-presentation";
import { getPs1EditionDetails, getPs1Work } from "./ps1-edition-data";
import { getPs2EditionDetails, getPs2Work } from "./ps2-edition-data";
import type { CatalogGame, GameDetails, IndexEntry } from "./types";
import { getCatalogGame, getPlatform, isPublicCatalogGame, meta } from "./catalog";

/** Índices precalculados (data/index/*.json). Regenerar con npm run details:indexes (incluye sync de entidades). */

function loadDataJson<T>(filename: string, fallback: T): T {
  try {
    return JSON.parse(
      readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "data", filename), "utf-8"),
    ) as T;
  } catch {
    return fallback;
  }
}

function isGameDetails(value: unknown): value is GameDetails {
  if (!value || typeof value !== "object") return false;
  if ("error" in value) return false;
  const detail = value as GameDetails;
  if (detail.ps1Edition?.schemaVersion === 2 || detail.ps2Edition?.schemaVersion === 2) return true;
  if (detail.description?.trim()) return true;
  if (!("fetchedAt" in value)) return false;
  return Boolean(
    detail.developer ||
      detail.publisher ||
      (detail.companyCredits?.length ?? 0) > 0 ||
      (detail.individualCredits?.length ?? 0) > 0 ||
      (detail.genres?.length ?? 0) > 0 ||
      detail.reference ||
      detail.year,
  );
}

let gameDetailsCache: Record<string, GameDetails> | null = null;

function loadGameDetails(): Record<string, GameDetails> {
  if (gameDetailsCache) return gameDetailsCache;
  const raw = loadDataJson<Record<string, unknown>>("game-details.json", {});
  gameDetailsCache = Object.fromEntries(
    Object.entries(raw)
      .filter((entry): entry is [string, GameDetails] => isGameDetails(entry[1]))
      .map(([id, details]) => [id, normalizeGameDetailsPresentation(details)]),
  );
  return gameDetailsCache;
}

export const companies = mergeCompanyIndex(
  loadDataJson<Record<string, IndexEntry>>(path.join("index", "companies.json"), {}),
);
export const genres = mergeGenreIndex(
  loadDataJson<Record<string, IndexEntry>>(path.join("index", "genres.json"), {}),
);
export const seriesIndex = seriesIndexData as Record<string, IndexEntry>;
export const tagsIndex = loadDataJson<Record<string, IndexEntry>>(
  path.join("index", "tags.json"),
  {},
);

const companyList = Object.values(companies).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const genreList = Object.values(genres).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const seriesList = Object.values(seriesIndex).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const tagList = Object.values(tagsIndex).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);

/** Recalcula contadores desde el catálogo listado actual. */
export function resolveIndexEntry(entry: IndexEntry): IndexEntry {
  const games = entry.gameIds
    .map((id) => getCatalogGame(id))
    .filter((g): g is CatalogGame => Boolean(g && isPublicCatalogGame(g)));
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
  if (entry.asDigitalPublisher) {
    resolved.asDigitalPublisher = entry.asDigitalPublisher.filter((id) => gameIds.includes(id));
  }
  if (entry.asPhysicalPublisherOrDistributor) {
    resolved.asPhysicalPublisherOrDistributor = entry.asPhysicalPublisherOrDistributor.filter(
      (id) => gameIds.includes(id),
    );
  }

  return resolved;
}

export function getGameDetails(id: string): GameDetails | undefined {
  const details = loadGameDetails()[id];
  if (details?.ps2Edition) {
    const ps2Edition = getPs2EditionDetails(id);
    const common = getPs2Work(ps2Edition?.workId)?.commonDetails;
    return { ...details, ps2Edition,
      genres: details.genres?.length ? details.genres : common?.genres ?? [],
      series: details.series ?? common?.series ?? null };
  }
  if (!details?.ps1Edition) return details;
  const ps1Edition = getPs1EditionDetails(id);
  if (!ps1Edition) return details;
  const common = getPs1Work(ps1Edition.workId)?.commonDetails;
  return {
    ...details,
    ps1Edition,
    genres: details.genres?.length ? details.genres : common?.genres ?? [],
    series: details.series ?? common?.series ?? null,
  };
}

export function getCompany(slug: string): IndexEntry | undefined {
  const canonicalSlug = resolveCanonicalCompanySlug(slug);
  const entry = companies[canonicalSlug];
  return entry ? resolveIndexEntry(entry) : undefined;
}

export function getGenre(slug: string): IndexEntry | undefined {
  const canonicalSlug = resolveCanonicalGenreSlug(slug);
  const entry = genres[canonicalSlug];
  return entry ? resolveIndexEntry(entry) : undefined;
}

export function getSeries(slug: string): IndexEntry | undefined {
  const entry = seriesIndex[slug];
  return entry ? resolveIndexEntry(entry) : undefined;
}

export function getTag(slug: string): IndexEntry | undefined {
  const entry = tagsIndex[slug];
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

export function getTags(): IndexEntry[] {
  return tagList;
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
    tags: tagList.length,
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
