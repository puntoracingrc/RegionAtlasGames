import { buildCatalogSeoSlug } from "./catalog-path";
import { formatCatalogEntryCount } from "./catalog-entry-count";
import { getPlatform } from "./catalog";
import { getGameDetails } from "./indexes";
import type { CatalogGame, DetailEntity, IndexEntry } from "./types";

export type SeriesCompanyRole = "developer" | "publisher" | "both";

export type SeriesCompanySummary = {
  name: string;
  slug: string;
  role: SeriesCompanyRole;
  catalogEntryCount: number;
  gameIds: string[];
};

export type SeriesPlatformSummary = {
  slug: string;
  name: string;
  catalogEntryCount: number;
};

export type SeriesTimelineGame = {
  id: string;
  title: string;
  href: string;
  year: number | null;
  platformName: string;
  region: string;
};

export type SeriesProfile = {
  slug: string;
  name: string;
  catalogEntryCount: number;
  platformCount: number;
  companyCount: number;
  firstYear: number | null;
  latestYear: number | null;
  description: string;
  history: string;
  companies: SeriesCompanySummary[];
  platforms: SeriesPlatformSummary[];
  timeline: SeriesTimelineGame[];
};

function addCompany(
  map: Map<string, SeriesCompanySummary & { developerIds: Set<string>; publisherIds: Set<string> }>,
  entity: DetailEntity | null | undefined,
  gameId: string,
  role: "developer" | "publisher",
) {
  if (!entity?.slug || !entity.name?.trim()) return;
  const existing =
    map.get(entity.slug) ??
    ({
      name: entity.name,
      slug: entity.slug,
      role,
      catalogEntryCount: 0,
      gameIds: [],
      developerIds: new Set<string>(),
      publisherIds: new Set<string>(),
    } satisfies SeriesCompanySummary & {
      developerIds: Set<string>;
      publisherIds: Set<string>;
    });

  if (!existing.gameIds.includes(gameId)) {
    existing.gameIds.push(gameId);
    existing.catalogEntryCount += 1;
  }
  if (role === "developer") existing.developerIds.add(gameId);
  if (role === "publisher") existing.publisherIds.add(gameId);
  existing.role =
    existing.developerIds.size > 0 && existing.publisherIds.size > 0
      ? "both"
      : existing.developerIds.size > 0
        ? "developer"
        : "publisher";
  map.set(entity.slug, existing);
}

function formatYearRange(firstYear: number | null, latestYear: number | null): string {
  if (firstYear && latestYear && firstYear !== latestYear) return `${firstYear}–${latestYear}`;
  if (firstYear) return String(firstYear);
  return "fechas pendientes";
}

function buildSeriesDescription(input: {
  entityKind: "franchise" | "series";
  name: string;
  catalogEntryCount: number;
  platformCount: number;
  firstYear: number | null;
  latestYear: number | null;
  topPlatforms: SeriesPlatformSummary[];
}) {
  const platformText = input.topPlatforms
    .slice(0, 4)
    .map((platform) => platform.name)
    .join(", ");
  const yearRange = formatYearRange(input.firstYear, input.latestYear);
  const entityLabel = input.entityKind === "franchise" ? "La franquicia" : "La saga o subserie";
  return `${entityLabel} ${input.name} agrupa ${formatCatalogEntryCount(input.catalogEntryCount)} del catálogo de Region Atlas, repartidas en ${input.platformCount.toLocaleString("es-ES")} plataforma${
    input.platformCount === 1 ? "" : "s"
  }${platformText ? ` como ${platformText}` : ""}. Su recorrido documentado abarca ${yearRange}.`;
}

function buildSeriesHistory(input: {
  entityKind: "franchise" | "series";
  name: string;
  firstYear: number | null;
  latestYear: number | null;
  companies: SeriesCompanySummary[];
  platforms: SeriesPlatformSummary[];
}) {
  const mainCompanies = input.companies
    .slice(0, 4)
    .map((company) => company.name)
    .join(", ");
  const mainPlatforms = input.platforms
    .slice(0, 4)
    .map((platform) => platform.name)
    .join(", ");
  const years = formatYearRange(input.firstYear, input.latestYear);

  const entityLabel = input.entityKind === "franchise" ? "franquicia" : "saga o subserie";
  return `${input.name} se documenta como ${entityLabel} a través de fichas fechadas en ${years}${
    mainCompanies ? `, con participación destacada de ${mainCompanies}` : ""
  }${mainPlatforms ? ` y presencia en ${mainPlatforms}` : ""}.`;
}

export function buildSeriesProfile(
  entry: IndexEntry,
  games: CatalogGame[],
  options?: { entityKind?: "franchise" | "series" },
): SeriesProfile {
  const entityKind = options?.entityKind ?? "series";
  const platformMap = new Map<string, SeriesPlatformSummary>();
  const companyMap = new Map<
    string,
    SeriesCompanySummary & { developerIds: Set<string>; publisherIds: Set<string> }
  >();
  const timeline: SeriesTimelineGame[] = [];
  const years: number[] = [];

  for (const game of games) {
    const details = getGameDetails(game.id);
    const platform = getPlatform(game.platformSlug);
    const platformSummary =
      platformMap.get(game.platformSlug) ??
      ({
        slug: game.platformSlug,
        name: platform?.shortName ?? game.platformSlug.toUpperCase(),
        catalogEntryCount: 0,
      } satisfies SeriesPlatformSummary);
    platformSummary.catalogEntryCount += 1;
    platformMap.set(game.platformSlug, platformSummary);

    if (details?.year) years.push(details.year);
    addCompany(companyMap, details?.developer, game.id, "developer");
    addCompany(companyMap, details?.publisher, game.id, "publisher");
    timeline.push({
      id: game.id,
      title: game.title,
      href: `/catalogo/${buildCatalogSeoSlug(game)}`,
      year: details?.year ?? null,
      platformName: platform?.shortName ?? game.platformSlug.toUpperCase(),
      region: game.region,
    });
  }

  const platforms = [...platformMap.values()].sort(
    (a, b) =>
      b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es"),
  );
  const companies = [...companyMap.values()]
    .map(({ developerIds: _developerIds, publisherIds: _publisherIds, ...company }) => company)
    .sort(
      (a, b) =>
        b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es"),
    );
  const firstYear = years.length ? Math.min(...years) : null;
  const latestYear = years.length ? Math.max(...years) : null;
  const sortedTimeline = timeline.sort(
    (a, b) =>
      (a.year ?? 9999) - (b.year ?? 9999) ||
      a.title.localeCompare(b.title, "es") ||
      a.platformName.localeCompare(b.platformName, "es"),
  );
  const editorialDescription = entry.description?.trim() || "";

  return {
    slug: entry.slug,
    name: entry.name,
    catalogEntryCount: games.length,
    platformCount: platforms.length,
    companyCount: companies.length,
    firstYear,
    latestYear,
    companies,
    platforms,
    timeline: sortedTimeline,
    description:
      editorialDescription ||
      buildSeriesDescription({
        entityKind,
        name: entry.name,
        catalogEntryCount: games.length,
        platformCount: platforms.length,
        firstYear,
        latestYear,
        topPlatforms: platforms,
      }),
    history:
      buildSeriesHistory({
        entityKind,
        name: entry.name,
        firstYear,
        latestYear,
        companies,
        platforms,
      }),
  };
}
