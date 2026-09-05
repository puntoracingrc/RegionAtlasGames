import { formatCompanyAliases, getCompanyEntity } from "./company-canonical";
import { getCatalogGame, getPlatform, isPublicCatalogGame } from "./catalog";
import { resolveCanonicalGenreEntity } from "./genre-canonical";
import { getStoredCompanyProfile } from "./company-profile";
import { resolveCompanyLogo } from "./company-logo";
import { formatCatalogEntryCount } from "./catalog-entry-count";
import { getCatalogWorkKey } from "./catalog-work";
import { getEffectivePrice, isGrailGame } from "./game-highlight";
import { summarizeIndexEntry } from "./index-entity";
import { getCompanies, getGameDetails, getGenre, indexStats } from "./indexes";
import {
  COMPANY_ACTIVITY_OPTIONS,
  COMPANY_MARKET_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  COMPANY_SORT_OPTIONS,
  COMPANY_STATUS_OPTIONS,
  DEFAULT_COMPANY_FILTERS,
  hasActiveCompanyFilters,
  type CompanyActivityFilter,
  type CompanyCardData,
  type CompanyCatalogSizeFilter,
  type CompanyExplorerData,
  type CompanyFilterOption,
  type CompanyIndexFilters,
  type CompanyMarketFilter,
  type CompanyRoleFilter,
  type CompanyRoleKind,
  type CompanySort,
  type CompanyStatusFilter,
} from "./company-explorer-types";
import type { IndexEntry } from "./types";

export {
  COMPANY_ACTIVITY_OPTIONS,
  COMPANY_MARKET_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  COMPANY_SORT_OPTIONS,
  COMPANY_STATUS_OPTIONS,
  DEFAULT_COMPANY_FILTERS,
  hasActiveCompanyFilters,
};
export type {
  CompanyActivityFilter,
  CompanyCardData,
  CompanyCatalogSizeFilter,
  CompanyExplorerData,
  CompanyFilterOption,
  CompanyIndexFilters,
  CompanyMarketFilter,
  CompanyRoleFilter,
  CompanyRoleKind,
  CompanySort,
  CompanyStatusFilter,
};

export type CompanyExplorerInitialData = Omit<CompanyExplorerData, "companies"> & {
  companies: CompanyCardData[];
  totalCount: number;
  initials: string[];
  grouped: {
    publishers: CompanyCardData[];
    developers: CompanyCardData[];
  } | null;
};

const PLATFORM_PREVIEW = 4;
export const COMPANY_PAGE_SIZE = 120;

let explorerCache: CompanyExplorerData | null = null;

function classifyRole(
  developerCatalogEntryCount: number,
  publisherCatalogEntryCount: number,
  digitalPublisherCatalogEntryCount: number,
  physicalPublisherCatalogEntryCount: number,
): CompanyRoleKind {
  const publicationCount =
    publisherCatalogEntryCount +
    digitalPublisherCatalogEntryCount +
    physicalPublisherCatalogEntryCount;
  if (developerCatalogEntryCount > 0 && publicationCount > 0) return "both";
  if (publicationCount > 0) return "publisher";
  return "developer";
}

function buildSearchHaystack(name: string, slug: string, aliases: string[]): string {
  return [name, slug, ...aliases]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function activityPeriodForYear(year: number): CompanyActivityFilter | null {
  if (year < 1980) return "pre-1980";
  if (year < 1990) return "1980s";
  if (year < 2000) return "1990s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  if (year < 2030) return "2020s";
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function companyInitial(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase("es-ES");
  if (!first) return "#";
  return /^\d$/.test(first) ? "0-9" : first.normalize("NFD").replace(/\p{M}/gu, "");
}

function companyNameGroup(name: string): number {
  const first = name.trim().charAt(0);
  if (/^\d$/.test(first)) return 0;
  if (/^\p{L}$/u.test(first)) return 1;
  return 2;
}

function compareCompanyNames(a: string, b: string): number {
  return (
    companyNameGroup(a) - companyNameGroup(b) ||
    a.localeCompare(b, "es", { numeric: true, sensitivity: "base" })
  );
}

function compareCompanyNamesDescending(a: string, b: string): number {
  return (
    companyNameGroup(a) - companyNameGroup(b) ||
    b.localeCompare(a, "es", { numeric: true, sensitivity: "base" })
  );
}

function enrichCompany(entry: IndexEntry): CompanyCardData {
  const summary = summarizeIndexEntry(entry, "company");
  const entity = getCompanyEntity(entry.slug);
  const aliases = formatCompanyAliases(entity, entry.aliasNames);
  const storedProfile = getStoredCompanyProfile(summary.slug);
  const logo = resolveCompanyLogo(summary.slug, storedProfile?.logoUrl);

  const genreSlugs = new Set<string>();
  const activityPeriods = new Set<CompanyActivityFilter>();
  const platformCounts = new Map<string, number>();
  const priceValues: number[] = [];
  let marketScore = 0;
  let highValueCatalogEntryCount = 0;
  let pricedCatalogEntryCount = 0;
  let developerCatalogEntryCount = 0;
  let publisherCatalogEntryCount = 0;
  let digitalPublisherCatalogEntryCount = 0;
  let physicalPublisherCatalogEntryCount = 0;
  let firstReleaseYear: number | null = null;
  let latestReleaseYear: number | null = null;
  const developerIds = new Set(summary.entry.asDeveloper ?? []);
  const publisherIds = new Set(summary.entry.asPublisher ?? []);
  const digitalPublisherIds = new Set(summary.entry.asDigitalPublisher ?? []);
  const physicalPublisherIds = new Set(
    summary.entry.asPhysicalPublisherOrDistributor ?? [],
  );
  const workKeys = new Set<string>();

  for (const gameId of summary.entry.gameIds) {
    const game = getCatalogGame(gameId);
    if (!game || !isPublicCatalogGame(game)) continue;

    platformCounts.set(game.platformSlug, (platformCounts.get(game.platformSlug) ?? 0) + 1);
    if (developerIds.has(gameId)) developerCatalogEntryCount += 1;
    if (publisherIds.has(gameId)) publisherCatalogEntryCount += 1;
    if (digitalPublisherIds.has(gameId)) digitalPublisherCatalogEntryCount += 1;
    if (physicalPublisherIds.has(gameId)) physicalPublisherCatalogEntryCount += 1;
    workKeys.add(getCatalogWorkKey(gameId));

    const details = getGameDetails(gameId);
    for (const genre of details?.genres ?? []) {
      genreSlugs.add(resolveCanonicalGenreEntity(genre).slug);
    }
    const year = details?.year;
    if (year != null && Number.isInteger(year) && year >= 1950 && year < 2100) {
      firstReleaseYear = firstReleaseYear == null ? year : Math.min(firstReleaseYear, year);
      latestReleaseYear = latestReleaseYear == null ? year : Math.max(latestReleaseYear, year);
      const period = activityPeriodForYear(year);
      if (period) activityPeriods.add(period);
    }
    const price = getEffectivePrice(game);
    if (price != null && price > 0) {
      marketScore += price;
      priceValues.push(price);
      pricedCatalogEntryCount += 1;
    }
    if (isGrailGame(game)) highValueCatalogEntryCount += 1;
  }

  const platforms = [...platformCounts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      name: getPlatform(slug)?.shortName ?? slug,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
  const catalogEntryCount = [...platformCounts.values()].reduce((total, count) => total + count, 0);
  const platformPreview = platforms
    .slice(0, PLATFORM_PREVIEW)
    .map((platform) => `${platform.name} (${formatCatalogEntryCount(platform.count)})`)
    .join(" · ");

  return {
    slug: summary.slug,
    name: summary.name,
    catalogEntryCount,
    uniqueWorkCount: workKeys.size,
    developerCatalogEntryCount,
    publisherCatalogEntryCount,
    digitalPublisherCatalogEntryCount,
    physicalPublisherCatalogEntryCount,
    roleKind: classifyRole(
      developerCatalogEntryCount,
      publisherCatalogEntryCount,
      digitalPublisherCatalogEntryCount,
      physicalPublisherCatalogEntryCount,
    ),
    platformSlugs: platforms.map((platform) => platform.slug),
    platformPreview,
    genreSlugs: [...genreSlugs],
    marketScore,
    medianPrice: median(priceValues),
    highValueCatalogEntryCount,
    pricedCatalogEntryCount,
    firstReleaseYear,
    latestReleaseYear,
    activityPeriods: activityPeriods.size > 0 ? [...activityPeriods] : ["unknown"],
    companyStatus: storedProfile?.status ?? "unknown",
    hasProfile: Boolean(storedProfile?.history),
    logoUrl: logo.url,
    logoIsProvisional: logo.provisional,
    searchHaystack: buildSearchHaystack(summary.name, summary.slug, aliases),
  };
}

function buildFilterOptions(
  companies: CompanyCardData[],
  key: "platformSlugs" | "genreSlugs",
  nameForSlug: (slug: string) => string,
): CompanyFilterOption[] {
  const counts = new Map<string, number>();
  for (const company of companies) {
    for (const slug of company[key]) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([slug, companyCount]) => ({ slug, name: nameForSlug(slug), companyCount }))
    .sort(
      (a, b) =>
        b.companyCount - a.companyCount || a.name.localeCompare(b.name, "es"),
    );
}

export function getCompanyExplorerData(): CompanyExplorerData {
  if (explorerCache) return explorerCache;

  const companies = getCompanies().map(enrichCompany).filter((company) => company.catalogEntryCount > 0);
  const statsMeta = indexStats();

  explorerCache = {
    companies,
    platformOptions: buildFilterOptions(
      companies,
      "platformSlugs",
      (slug) => getPlatform(slug)?.shortName ?? slug,
    ),
    genreOptions: buildFilterOptions(companies, "genreSlugs", (slug) => getGenre(slug)?.name ?? slug),
    filterCounts: {
      status: {
        active: companies.filter((company) => company.companyStatus === "active").length,
        defunct: companies.filter((company) => company.companyStatus === "defunct").length,
        subsidiary: companies.filter((company) => company.companyStatus === "subsidiary").length,
        unknown: companies.filter((company) => company.companyStatus === "unknown").length,
      },
      activity: {
        "pre-1980": companies.filter((company) => company.activityPeriods.includes("pre-1980")).length,
        "1980s": companies.filter((company) => company.activityPeriods.includes("1980s")).length,
        "1990s": companies.filter((company) => company.activityPeriods.includes("1990s")).length,
        "2000s": companies.filter((company) => company.activityPeriods.includes("2000s")).length,
        "2010s": companies.filter((company) => company.activityPeriods.includes("2010s")).length,
        "2020s": companies.filter((company) => company.activityPeriods.includes("2020s")).length,
        unknown: companies.filter((company) => company.activityPeriods.includes("unknown")).length,
      },
    },
    stats: {
      total: companies.length,
      publishers: companies.filter((c) => c.roleKind === "publisher").length,
      developers: companies.filter((c) => c.roleKind === "developer").length,
      dualRole: companies.filter((c) => c.roleKind === "both").length,
      withProfile: companies.filter((c) => c.hasProfile).length,
      catalogEntriesWithDetails: statsMeta.gamesWithDetails ?? 0,
    },
  };

  return explorerCache;
}

export function getCompanyExplorerInitialData(): CompanyExplorerInitialData {
  const data = getCompanyExplorerData();
  const order = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const available = new Set(data.companies.map((company) => companyInitial(company.name)));
  const initials = [
    ...(available.has("0-9") ? ["0-9"] : []),
    ...order.filter((letter) => available.has(letter)),
  ];
  const publishers = filterCompanies(data.companies, {
    ...DEFAULT_COMPANY_FILTERS,
    role: "publishers",
    sort: "games-desc",
  }).slice(0, 12);
  const developers = filterCompanies(data.companies, {
    ...DEFAULT_COMPANY_FILTERS,
    role: "developers",
    sort: "games-desc",
  }).slice(0, 12);
  const initialCompanies = filterCompanies(data.companies, DEFAULT_COMPANY_FILTERS);

  return {
    ...data,
    companies: initialCompanies.slice(0, COMPANY_PAGE_SIZE),
    totalCount: data.companies.length,
    initials,
    grouped: publishers.length === 0 && developers.length === 0 ? null : { publishers, developers },
  };
}

function matchesInitial(company: CompanyCardData, initial: string): boolean {
  return initial === "all" || companyInitial(company.name) === initial;
}

function matchesSearch(company: CompanyCardData, query: string): boolean {
  const needle = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.every((token) => company.searchHaystack.includes(token));
}

function matchesRole(company: CompanyCardData, role: CompanyRoleFilter): boolean {
  switch (role) {
    case "publishers":
      return company.roleKind === "publisher" || company.roleKind === "both";
    case "developers":
      return company.roleKind === "developer" || company.roleKind === "both";
    case "both":
      return company.roleKind === "both";
    default:
      return true;
  }
}

function matchesMarket(company: CompanyCardData, market: CompanyMarketFilter): boolean {
  switch (market) {
    case "collectible":
      return company.highValueCatalogEntryCount > 0;
    case "priced":
      return company.pricedCatalogEntryCount > 0;
    case "unpriced":
      return company.pricedCatalogEntryCount === 0;
    default:
      return true;
  }
}

function matchesCatalogSize(company: CompanyCardData, size: CompanyCatalogSizeFilter): boolean {
  switch (size) {
    case "micro":
      return company.catalogEntryCount <= 4;
    case "small":
      return company.catalogEntryCount >= 5 && company.catalogEntryCount <= 19;
    case "medium":
      return company.catalogEntryCount >= 20 && company.catalogEntryCount <= 49;
    case "large":
      return company.catalogEntryCount >= 50 && company.catalogEntryCount <= 199;
    case "major":
      return company.catalogEntryCount >= 200;
    default:
      return true;
  }
}

function matchesStatus(company: CompanyCardData, status: CompanyStatusFilter): boolean {
  return status === "all" || company.companyStatus === status;
}

function matchesActivity(company: CompanyCardData, activity: CompanyActivityFilter): boolean {
  return activity === "all" || company.activityPeriods.includes(activity);
}

function sortCompanies(list: CompanyCardData[], sort: CompanySort): CompanyCardData[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return compareCompanyNames(a.name, b.name);
      case "name-desc":
        return compareCompanyNamesDescending(a.name, b.name);
      case "games-asc":
        return a.catalogEntryCount - b.catalogEntryCount || a.name.localeCompare(b.name, "es");
      case "games-desc":
        return b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es");
      case "market-desc":
        return (
          b.marketScore - a.marketScore ||
          b.highValueCatalogEntryCount - a.highValueCatalogEntryCount ||
          b.catalogEntryCount - a.catalogEntryCount ||
          a.name.localeCompare(b.name, "es")
        );
      case "median-desc":
        return (
          (b.medianPrice ?? Number.NEGATIVE_INFINITY) -
            (a.medianPrice ?? Number.NEGATIVE_INFINITY) ||
          b.pricedCatalogEntryCount - a.pricedCatalogEntryCount ||
          a.name.localeCompare(b.name, "es")
        );
      case "grails-desc":
        return (
          b.highValueCatalogEntryCount - a.highValueCatalogEntryCount ||
          b.marketScore - a.marketScore ||
          a.name.localeCompare(b.name, "es")
        );
      case "recent-desc":
        return (
          (b.latestReleaseYear ?? Number.NEGATIVE_INFINITY) -
            (a.latestReleaseYear ?? Number.NEGATIVE_INFINITY) ||
          b.catalogEntryCount - a.catalogEntryCount ||
          a.name.localeCompare(b.name, "es")
        );
      case "dev-desc":
        return (
          b.developerCatalogEntryCount - a.developerCatalogEntryCount ||
          b.catalogEntryCount - a.catalogEntryCount ||
          a.name.localeCompare(b.name, "es")
        );
      case "pub-desc":
        return (
          b.publisherCatalogEntryCount +
            b.digitalPublisherCatalogEntryCount +
            b.physicalPublisherCatalogEntryCount -
            (a.publisherCatalogEntryCount +
              a.digitalPublisherCatalogEntryCount +
              a.physicalPublisherCatalogEntryCount) ||
          b.catalogEntryCount - a.catalogEntryCount ||
          a.name.localeCompare(b.name, "es")
        );
      default:
        return 0;
    }
  });
  return sorted;
}

export function filterCompanies(
  companies: CompanyCardData[],
  filters: CompanyIndexFilters,
): CompanyCardData[] {
  let result = companies.filter(
    (company) =>
      matchesSearch(company, filters.q) &&
      matchesInitial(company, filters.initial) &&
      matchesRole(company, filters.role) &&
      matchesCatalogSize(company, filters.size) &&
      matchesStatus(company, filters.status) &&
      matchesActivity(company, filters.activity) &&
      matchesMarket(company, filters.market) &&
      (filters.platform === "all" || company.platformSlugs.includes(filters.platform)) &&
      (filters.genre === "all" || company.genreSlugs.includes(filters.genre)),
  );
  result = sortCompanies(result, filters.sort);
  return result;
}

export function companyRoleLabel(role: CompanyRoleKind): string {
  switch (role) {
    case "publisher":
      return "Publicadora";
    case "developer":
      return "Desarrolladora";
    case "both":
      return "Pub · Dev";
  }
}

export function companyListIntro(stats: CompanyExplorerData["stats"]): string {
  return [
    `${stats.total.toLocaleString("es-ES")} compañías unificadas`,
    `${stats.publishers.toLocaleString("es-ES")} solo publicadoras`,
    `${stats.developers.toLocaleString("es-ES")} solo desarrolladoras`,
    `${stats.dualRole.toLocaleString("es-ES")} con ambos roles`,
    `${formatCatalogEntryCount(stats.catalogEntriesWithDetails)} con información detallada`,
  ].join(" · ");
}
