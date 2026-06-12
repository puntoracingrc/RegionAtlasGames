import companiesData from "../../data/index/companies.json";
import genresData from "../../data/index/genres.json";
import seriesData from "../../data/index/series.json";
import gameDetailsData from "../../data/game-details.json";
import type { CatalogGame, GameDetails, IndexEntry } from "./types";
import { catalog, getCatalogGame, getPlatform, listedCatalog } from "./catalog";

export const companies = companiesData as Record<string, IndexEntry>;
export const genres = genresData as Record<string, IndexEntry>;
export const seriesIndex = seriesData as Record<string, IndexEntry>;

function isGameDetails(value: unknown): value is GameDetails {
  if (!value || typeof value !== "object") return false;
  if ("error" in value) return false;
  return "museumPath" in value && "fetchedAt" in value;
}

const rawGameDetails = gameDetailsData as Record<string, unknown>;
export const gameDetails: Record<string, GameDetails> = Object.fromEntries(
  Object.entries(rawGameDetails).filter((entry): entry is [string, GameDetails] =>
    isGameDetails(entry[1]),
  ),
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

export function getGameDetails(id: string): GameDetails | undefined {
  return gameDetails[id];
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
  const withDetails = listedCatalog.filter((g) => gameDetails[g.id]).length;
  return {
    companies: companyList.length,
    genres: genreList.length,
    series: seriesList.length,
    gamesWithDetails: withDetails,
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
