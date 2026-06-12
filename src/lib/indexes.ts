import companiesData from "../../data/index/companies.json";
import genresData from "../../data/index/genres.json";
import seriesData from "../../data/index/series.json";
import gameDetailsData from "../../data/game-details.json";
import type { CatalogGame, GameDetails, IndexEntry } from "./types";
import { getCatalogGame, getPlatform, listedCatalog, meta } from "./catalog";

export const companies = companiesData as Record<string, IndexEntry>;
export const genres = genresData as Record<string, IndexEntry>;
export const seriesIndex = seriesData as Record<string, IndexEntry>;

function isGameDetails(value: unknown): value is GameDetails {
  if (!value || typeof value !== "object") return false;
  if ("error" in value) return false;
  return "museumPath" in value && "fetchedAt" in value;
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

const companyList = Object.values(companies).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const genreList = Object.values(genres).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);
const seriesList = Object.values(seriesIndex).sort(
  (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es"),
);

export function getGameDetails(id: string): GameDetails | undefined {
  return loadGameDetails()[id];
}

export function getCompany(slug: string): IndexEntry | undefined {
  return companies[slug];
}

export function getGenre(slug: string): IndexEntry | undefined {
  return genres[slug];
}

export function getSeries(slug: string): IndexEntry | undefined {
  return seriesIndex[slug];
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
  return entry.gameIds
    .map((id) => getCatalogGame(id))
    .filter((g): g is CatalogGame => Boolean(g && g.listingStatus !== "excluded"));
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
  return Object.entries(entry.byPlatform)
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
