import { formatCatalogEntryCount } from "./catalog-entry-count";
import type {
  CompanyActivityFilter,
  CompanyCardData,
  CompanyCatalogSizeFilter,
  CompanyExplorerData,
  CompanyIndexFilters,
  CompanyMarketFilter,
  CompanyRoleFilter,
  CompanyRoleKind,
  CompanySort,
  CompanyStatusFilter,
} from "./company-explorer-types";

export const COMPANY_PAGE_SIZE = 48;
export const COMPANY_INITIAL_RESULT_COUNT = 24;

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
  return companyNameGroup(a) - companyNameGroup(b) ||
    a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function compareCompanyNamesDescending(a: string, b: string): number {
  return companyNameGroup(a) - companyNameGroup(b) ||
    b.localeCompare(a, "es", { numeric: true, sensitivity: "base" });
}

function matchesInitial(company: CompanyCardData, initial: string): boolean {
  return initial === "all" || companyInitial(company.name) === initial;
}

function matchesSearch(company: CompanyCardData, query: string): boolean {
  const needle = query.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!needle) return true;
  return needle.split(/\s+/).filter(Boolean)
    .every((token) => company.searchHaystack.includes(token));
}

function matchesRole(company: CompanyCardData, role: CompanyRoleFilter): boolean {
  if (role === "publishers") return company.roleKind === "publisher" || company.roleKind === "both";
  if (role === "developers") return company.roleKind === "developer" || company.roleKind === "both";
  if (role === "both") return company.roleKind === "both";
  return true;
}

function matchesMarket(company: CompanyCardData, market: CompanyMarketFilter): boolean {
  if (market === "collectible") return company.highValueCatalogEntryCount > 0;
  if (market === "priced") return company.pricedCatalogEntryCount > 0;
  if (market === "unpriced") return company.pricedCatalogEntryCount === 0;
  return true;
}

function matchesCatalogSize(company: CompanyCardData, size: CompanyCatalogSizeFilter): boolean {
  if (size === "micro") return company.catalogEntryCount <= 4;
  if (size === "small") return company.catalogEntryCount >= 5 && company.catalogEntryCount <= 19;
  if (size === "medium") return company.catalogEntryCount >= 20 && company.catalogEntryCount <= 49;
  if (size === "large") return company.catalogEntryCount >= 50 && company.catalogEntryCount <= 199;
  if (size === "major") return company.catalogEntryCount >= 200;
  return true;
}

function matchesStatus(company: CompanyCardData, status: CompanyStatusFilter): boolean {
  return status === "all" || company.companyStatus === status;
}

function matchesActivity(company: CompanyCardData, activity: CompanyActivityFilter): boolean {
  return activity === "all" || company.activityPeriods.includes(activity);
}

function sortCompanies(list: CompanyCardData[], sort: CompanySort): CompanyCardData[] {
  return [...list].sort((a, b) => {
    if (sort === "name-asc") return compareCompanyNames(a.name, b.name);
    if (sort === "name-desc") return compareCompanyNamesDescending(a.name, b.name);
    if (sort === "games-asc") return a.catalogEntryCount - b.catalogEntryCount || a.name.localeCompare(b.name, "es");
    if (sort === "games-desc") return b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es");
    if (sort === "market-desc") return b.marketScore - a.marketScore || b.highValueCatalogEntryCount - a.highValueCatalogEntryCount || b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es");
    if (sort === "median-desc") return (b.medianPrice ?? Number.NEGATIVE_INFINITY) - (a.medianPrice ?? Number.NEGATIVE_INFINITY) || b.pricedCatalogEntryCount - a.pricedCatalogEntryCount || a.name.localeCompare(b.name, "es");
    if (sort === "grails-desc") return b.highValueCatalogEntryCount - a.highValueCatalogEntryCount || b.marketScore - a.marketScore || a.name.localeCompare(b.name, "es");
    if (sort === "recent-desc") return (b.latestReleaseYear ?? Number.NEGATIVE_INFINITY) - (a.latestReleaseYear ?? Number.NEGATIVE_INFINITY) || b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es");
    if (sort === "dev-desc") return b.developerCatalogEntryCount - a.developerCatalogEntryCount || b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es");
    if (sort === "pub-desc") {
      const publication = (company: CompanyCardData) => company.publisherCatalogEntryCount + company.digitalPublisherCatalogEntryCount + company.physicalPublisherCatalogEntryCount;
      return publication(b) - publication(a) || b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es");
    }
    return 0;
  });
}

export function filterCompanies(
  companies: CompanyCardData[],
  filters: CompanyIndexFilters,
): CompanyCardData[] {
  return sortCompanies(companies.filter((company) =>
    matchesSearch(company, filters.q) &&
    matchesInitial(company, filters.initial) &&
    matchesRole(company, filters.role) &&
    matchesCatalogSize(company, filters.size) &&
    matchesStatus(company, filters.status) &&
    matchesActivity(company, filters.activity) &&
    matchesMarket(company, filters.market) &&
    (filters.platform === "all" || company.platformSlugs.includes(filters.platform)) &&
    (filters.genre === "all" || company.genreSlugs.includes(filters.genre)),
  ), filters.sort);
}

export function companyRoleLabel(role: CompanyRoleKind): string {
  if (role === "publisher") return "Publicadora";
  if (role === "developer") return "Desarrolladora";
  return "Pub · Dev";
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
