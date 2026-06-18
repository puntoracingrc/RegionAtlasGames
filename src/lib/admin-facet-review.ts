import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { canWriteCatalogFiles } from "./admin-auth";
import { listedCatalog, getCatalogGame } from "./catalog";
import { writeCatalogOverlay } from "./catalog-runtime-overlay";
import {
  findGameFacetEntityByNameOrAlias,
  findGameFacetEntityBySlug,
  getGameFacetsTaxonomy,
} from "./game-facets/taxonomy";
import type { CatalogGame, DetailEntity, GameDetails } from "./types";

const DETAILS_FILE = path.join(process.cwd(), "data", "game-details.json");

export type AdminFacetReviewStatus = "complete" | "missing-subgenres" | "missing-facets" | "empty";

export type AdminFacetReviewGame = {
  id: string;
  title: string;
  platformSlug: string;
  region: string;
  year: number | null;
  genres: DetailEntity[];
  subgenres: DetailEntity[];
  facets: DetailEntity[];
  tags: DetailEntity[];
  suggestedSubgenres: DetailEntity[];
  suggestedFacets: DetailEntity[];
  status: AdminFacetReviewStatus;
};

export type AdminFacetReviewSummary = {
  totalGames: number;
  withSubgenres: number;
  withFacets: number;
  complete: number;
  empty: number;
  withSuggestions: number;
};

export type AdminFacetCoveragePlatform = {
  platformSlug: string;
  totalGames: number;
  withSubgenres: number;
  withFacets: number;
  complete: number;
};

export type AdminFacetCoverageEntity = {
  slug: string;
  name: string;
  count: number;
};

export type AdminFacetCoverage = {
  platforms: AdminFacetCoveragePlatform[];
  topSubgenres: AdminFacetCoverageEntity[];
  topFacets: AdminFacetCoverageEntity[];
};

export type AdminFacetReviewOptions = {
  subgenres: { slug: string; name: string }[];
  facets: { slug: string; name: string }[];
};

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function uniqueEntities(entities: DetailEntity[]): DetailEntity[] {
  const seen = new Set<string>();
  const result: DetailEntity[] = [];
  for (const entity of entities) {
    const key = entity.slug || normalizeText(entity.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(entity);
  }
  return result;
}

function detailFromTaxonomy(name: string, expectedType: "subgenre" | "facet"): DetailEntity | null {
  const entity = findGameFacetEntityByNameOrAlias(name) ?? findGameFacetEntityBySlug(name);
  if (!entity || entity.type !== expectedType) return null;
  return {
    name: entity.name,
    slug: entity.slug,
    museumPath: null,
    pcPath: null,
    source: "merged",
  };
}

function suggestFromDetails(details: GameDetails | undefined): {
  subgenres: DetailEntity[];
  facets: DetailEntity[];
} {
  const terms = [
    ...(details?.tags ?? []),
    ...(details?.genres ?? []),
  ].map((entity) => entity.name);
  return {
    subgenres: uniqueEntities(terms.map((term) => detailFromTaxonomy(term, "subgenre")).filter(Boolean) as DetailEntity[]),
    facets: uniqueEntities(terms.map((term) => detailFromTaxonomy(term, "facet")).filter(Boolean) as DetailEntity[]),
  };
}

function reviewStatus(details: GameDetails | undefined): AdminFacetReviewStatus {
  const subgenreCount = details?.subgenres?.length ?? 0;
  const facetCount = details?.facets?.length ?? 0;
  if (subgenreCount > 0 && facetCount > 0) return "complete";
  if (subgenreCount === 0 && facetCount === 0) return "empty";
  if (subgenreCount === 0) return "missing-subgenres";
  return "missing-facets";
}

function toReviewGame(game: CatalogGame, details: GameDetails | undefined): AdminFacetReviewGame {
  const suggestions = suggestFromDetails(details);
  const currentSubgenres = details?.subgenres ?? [];
  const currentFacets = details?.facets ?? [];
  return {
    id: game.id,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    year: details?.year ?? null,
    genres: details?.genres ?? [],
    subgenres: currentSubgenres,
    facets: currentFacets,
    tags: details?.tags ?? [],
    suggestedSubgenres: suggestions.subgenres.filter(
      (entity) => !currentSubgenres.some((current) => current.slug === entity.slug),
    ),
    suggestedFacets: suggestions.facets.filter(
      (entity) => !currentFacets.some((current) => current.slug === entity.slug),
    ),
    status: reviewStatus(details),
  };
}

export function getAdminFacetReviewOptions(): AdminFacetReviewOptions {
  const taxonomy = getGameFacetsTaxonomy();
  return {
    subgenres: taxonomy.subgenres.map((entity) => ({ slug: entity.slug, name: entity.name })),
    facets: taxonomy.facets.map((entity) => ({ slug: entity.slug, name: entity.name })),
  };
}

export function getAdminFacetReviewQueue(input: {
  q?: string;
  status?: string;
  limit?: number;
}): {
  summary: AdminFacetReviewSummary;
  coverage: AdminFacetCoverage;
  options: AdminFacetReviewOptions;
  games: AdminFacetReviewGame[];
} {
  const detailsById = loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});
  const allRows = listedCatalog.map((game) => toReviewGame(game, detailsById[game.id]));
  const platforms = new Map<string, AdminFacetCoveragePlatform>();
  const subgenreCounts = new Map<string, AdminFacetCoverageEntity>();
  const facetCounts = new Map<string, AdminFacetCoverageEntity>();
  const summary = allRows.reduce<AdminFacetReviewSummary>(
    (acc, row) => {
      acc.totalGames += 1;
      if (row.subgenres.length > 0) acc.withSubgenres += 1;
      if (row.facets.length > 0) acc.withFacets += 1;
      if (row.status === "complete") acc.complete += 1;
      if (row.status === "empty") acc.empty += 1;
      if (row.suggestedSubgenres.length > 0 || row.suggestedFacets.length > 0) acc.withSuggestions += 1;

      const platform = platforms.get(row.platformSlug) ?? {
        platformSlug: row.platformSlug,
        totalGames: 0,
        withSubgenres: 0,
        withFacets: 0,
        complete: 0,
      };
      platform.totalGames += 1;
      if (row.subgenres.length > 0) platform.withSubgenres += 1;
      if (row.facets.length > 0) platform.withFacets += 1;
      if (row.status === "complete") platform.complete += 1;
      platforms.set(row.platformSlug, platform);

      for (const subgenre of row.subgenres) {
        const current = subgenreCounts.get(subgenre.slug) ?? { slug: subgenre.slug, name: subgenre.name, count: 0 };
        current.count += 1;
        subgenreCounts.set(subgenre.slug, current);
      }
      for (const facet of row.facets) {
        const current = facetCounts.get(facet.slug) ?? { slug: facet.slug, name: facet.name, count: 0 };
        current.count += 1;
        facetCounts.set(facet.slug, current);
      }
      return acc;
    },
    { totalGames: 0, withSubgenres: 0, withFacets: 0, complete: 0, empty: 0, withSuggestions: 0 },
  );
  const coverage: AdminFacetCoverage = {
    platforms: [...platforms.values()]
      .sort((a, b) => b.totalGames - a.totalGames || a.platformSlug.localeCompare(b.platformSlug))
      .slice(0, 18),
    topSubgenres: [...subgenreCounts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
      .slice(0, 18),
    topFacets: [...facetCounts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
      .slice(0, 18),
  };

  const needle = normalizeText(input.q ?? "");
  const status = input.status?.trim() ?? "";
  const limit = Math.min(Math.max(Number(input.limit ?? 80), 1), 200);

  const games = allRows
    .filter((row) => !status || row.status === status || (status === "suggestions" && (row.suggestedSubgenres.length > 0 || row.suggestedFacets.length > 0)))
    .filter((row) => {
      if (needle.length < 2) return true;
      return normalizeText([row.title, row.id, row.platformSlug, ...row.genres.map((g) => g.name)].join(" ")).includes(needle);
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      return a.title.localeCompare(b.title, "es", { numeric: true });
    })
    .slice(0, limit);

  return { summary, coverage, options: getAdminFacetReviewOptions(), games };
}

function defaultDetails(): GameDetails {
  const now = new Date().toISOString().slice(0, 19);
  return {
    year: null,
    releaseDate: null,
    reference: null,
    players: null,
    support: null,
    developer: null,
    publisher: null,
    genres: [],
    subgenres: [],
    facets: [],
    series: null,
    fetchedAt: now,
    mergedAt: now,
    description: null,
  };
}

export async function applyAdminFacetReview(input: {
  gameIds: string[];
  subgenres?: string[];
  facets?: string[];
  mode?: "append" | "replace";
}): Promise<{ ok: true; affectedCount: number } | { error: string }> {
  const gameIds = [...new Set(input.gameIds.map((id) => id.trim()).filter(Boolean))];
  const subgenres = uniqueEntities((input.subgenres ?? []).map((name) => detailFromTaxonomy(name, "subgenre")).filter(Boolean) as DetailEntity[]);
  const facets = uniqueEntities((input.facets ?? []).map((name) => detailFromTaxonomy(name, "facet")).filter(Boolean) as DetailEntity[]);
  const mode = input.mode === "replace" ? "replace" : "append";

  if (gameIds.length === 0) return { error: "Selecciona al menos un juego." };
  if (subgenres.length === 0 && facets.length === 0) {
    return { error: "Añade al menos un subgénero o faceta controlada." };
  }

  const detailsById = loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});
  let affectedCount = 0;

  for (const gameId of gameIds) {
    const game = getCatalogGame(gameId);
    if (!game) continue;
    const current = detailsById[gameId] ?? defaultDetails();
    const next: GameDetails = {
      ...current,
      subgenres: mode === "replace" ? subgenres : uniqueEntities([...(current.subgenres ?? []), ...subgenres]),
      facets: mode === "replace" ? facets : uniqueEntities([...(current.facets ?? []), ...facets]),
      mergedAt: new Date().toISOString().slice(0, 19),
    };
    detailsById[gameId] = next;
    affectedCount += 1;

    if (!canWriteCatalogFiles()) {
      const saved = await writeCatalogOverlay({ game, details: next });
      if ("error" in saved) return { error: saved.error };
    }
  }

  if (affectedCount === 0) return { error: "No hay juegos válidos para modificar." };
  if (canWriteCatalogFiles()) saveJson(DETAILS_FILE, detailsById);

  return { ok: true, affectedCount };
}
