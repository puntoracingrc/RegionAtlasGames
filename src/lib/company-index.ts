import { formatCompanyAliases, getCompanyEntity } from "./company-canonical";
import { getCatalogGame, getPlatform, isPublicCatalogGame } from "./catalog";
import { resolveCanonicalGenreEntity } from "./genre-canonical";
import { getStoredCompanyProfile } from "./company-profile";
import { resolveCompanyLogo } from "./company-logo";
import { getEffectivePrice, isGrailGame } from "./game-highlight";
import { summarizeIndexEntry } from "./index-entity";
import { getCompanies, getGameDetails, getGenre, indexStats } from "./indexes";
import type { IndexEntry } from "./types";

export type CompanyRoleKind = "publisher" | "developer" | "both";

export type CompanyMarketFilter = "all" | "collectible" | "priced" | "major";

export type CompanySort =
  | "name-asc"
  | "name-desc"
  | "games-desc"
  | "games-asc"
  | "market-desc"
  | "dev-desc"
  | "pub-desc";

export type CompanyRoleFilter = "all" | "publishers" | "developers" | "both";

export type CompanyIndexFilters = {
  q: string;
  initial: string;
  role: CompanyRoleFilter;
  platform: string;
  genre: string;
  market: CompanyMarketFilter;
  sort: CompanySort;
};

export const DEFAULT_COMPANY_FILTERS: CompanyIndexFilters = {
  q: "",
  initial: "all",
  role: "all",
  platform: "all",
  genre: "all",
  market: "all",
  sort: "games-desc",
};

export const COMPANY_SORT_OPTIONS: { value: CompanySort; label: string }[] = [
  { value: "games-desc", label: "Más juegos en catálogo" },
  { value: "games-asc", label: "Menos juegos" },
  { value: "market-desc", label: "Relevancia en mercado" },
  { value: "name-asc", label: "Nombre (A → Z)" },
  { value: "name-desc", label: "Nombre (Z → A)" },
  { value: "dev-desc", label: "Más títulos como desarrolladora" },
  { value: "pub-desc", label: "Más títulos como publicadora" },
];

export const COMPANY_MARKET_OPTIONS: { value: CompanyMarketFilter; label: string }[] = [
  { value: "all", label: "Todo el mercado" },
  { value: "major", label: "Catálogo amplio (50+ juegos)" },
  { value: "collectible", label: "Con títulos de alto valor" },
  { value: "priced", label: "Con precios de mercado ES" },
];

export type CompanyCardData = {
  slug: string;
  name: string;
  gameCount: number;
  developerCount: number;
  publisherCount: number;
  roleKind: CompanyRoleKind;
  platformSlugs: string[];
  platformPreview: string;
  genreSlugs: string[];
  marketScore: number;
  grailCount: number;
  pricedCount: number;
  hasProfile: boolean;
  logoUrl: string | null;
  logoIsProvisional: boolean;
  searchHaystack: string;
};

export type CompanyFilterOption = { slug: string; name: string; count: number };

export type CompanyExplorerData = {
  companies: CompanyCardData[];
  platformOptions: CompanyFilterOption[];
  genreOptions: CompanyFilterOption[];
  stats: {
    total: number;
    publishers: number;
    developers: number;
    dualRole: number;
    withProfile: number;
    gamesWithDetails: number;
  };
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
const MAJOR_CATALOG_MIN = 50;
export const COMPANY_PAGE_SIZE = 120;

let explorerCache: CompanyExplorerData | null = null;

function classifyRole(developerCount: number, publisherCount: number): CompanyRoleKind {
  if (developerCount > 0 && publisherCount > 0) return "both";
  if (publisherCount > 0) return "publisher";
  return "developer";
}

function buildSearchHaystack(name: string, slug: string, aliases: string[]): string {
  return [name, slug, ...aliases]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function companyInitial(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase("es-ES");
  if (!first) return "#";
  return /^\d$/.test(first) ? "0-9" : first.normalize("NFD").replace(/\p{M}/gu, "");
}

function enrichCompany(entry: IndexEntry): CompanyCardData {
  const summary = summarizeIndexEntry(entry, "company");
  const entity = getCompanyEntity(entry.slug);
  const aliases = formatCompanyAliases(entity);
  const storedProfile = getStoredCompanyProfile(summary.slug);
  const logo = resolveCompanyLogo(summary.slug, storedProfile?.logoUrl);

  const genreSlugs = new Set<string>();
  const platformCounts = new Map<string, number>();
  let marketScore = 0;
  let grailCount = 0;
  let pricedCount = 0;
  let developerCount = 0;
  let publisherCount = 0;
  const developerIds = new Set(summary.entry.asDeveloper ?? []);
  const publisherIds = new Set(summary.entry.asPublisher ?? []);

  for (const gameId of summary.entry.gameIds) {
    const game = getCatalogGame(gameId);
    if (!game || !isPublicCatalogGame(game)) continue;

    platformCounts.set(game.platformSlug, (platformCounts.get(game.platformSlug) ?? 0) + 1);
    if (developerIds.has(gameId)) developerCount += 1;
    if (publisherIds.has(gameId)) publisherCount += 1;

    const details = getGameDetails(gameId);
    for (const genre of details?.genres ?? []) {
      genreSlugs.add(resolveCanonicalGenreEntity(genre).slug);
    }
    const price = getEffectivePrice(game);
    if (price != null && price > 0) {
      marketScore += price;
      pricedCount += 1;
    }
    if (isGrailGame(game)) grailCount += 1;
  }

  const platforms = [...platformCounts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      name: getPlatform(slug)?.shortName ?? slug,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
  const gameCount = [...platformCounts.values()].reduce((total, count) => total + count, 0);
  const platformPreview = platforms
    .slice(0, PLATFORM_PREVIEW)
    .map((platform) => `${platform.name} (${platform.count})`)
    .join(" · ");

  return {
    slug: summary.slug,
    name: summary.name,
    gameCount,
    developerCount,
    publisherCount,
    roleKind: classifyRole(developerCount, publisherCount),
    platformSlugs: platforms.map((platform) => platform.slug),
    platformPreview,
    genreSlugs: [...genreSlugs],
    marketScore,
    grailCount,
    pricedCount,
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
    .map(([slug, count]) => ({ slug, name: nameForSlug(slug), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

export function getCompanyExplorerData(): CompanyExplorerData {
  if (explorerCache) return explorerCache;

  const companies = getCompanies().map(enrichCompany).filter((company) => company.gameCount > 0);
  const statsMeta = indexStats();

  explorerCache = {
    companies,
    platformOptions: buildFilterOptions(
      companies,
      "platformSlugs",
      (slug) => getPlatform(slug)?.shortName ?? slug,
    ),
    genreOptions: buildFilterOptions(companies, "genreSlugs", (slug) => getGenre(slug)?.name ?? slug),
    stats: {
      total: companies.length,
      publishers: companies.filter((c) => c.roleKind === "publisher").length,
      developers: companies.filter((c) => c.roleKind === "developer").length,
      dualRole: companies.filter((c) => c.roleKind === "both").length,
      withProfile: companies.filter((c) => c.hasProfile).length,
      gamesWithDetails: statsMeta.gamesWithDetails ?? 0,
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
  }).slice(0, 12);
  const developers = filterCompanies(data.companies, {
    ...DEFAULT_COMPANY_FILTERS,
    role: "developers",
  }).slice(0, 12);

  return {
    ...data,
    companies: data.companies.slice(0, COMPANY_PAGE_SIZE),
    totalCount: data.companies.length,
    initials,
    grouped: publishers.length === 0 && developers.length === 0 ? null : { publishers, developers },
  };
}

export function hasActiveCompanyFilters(filters: CompanyIndexFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.initial !== "all" ||
    filters.role !== "all" ||
    filters.platform !== "all" ||
    filters.genre !== "all" ||
    filters.market !== "all" ||
    filters.sort !== DEFAULT_COMPANY_FILTERS.sort
  );
}

function matchesInitial(company: CompanyCardData, initial: string): boolean {
  return initial === "all" || companyInitial(company.name) === initial;
}

function matchesSearch(company: CompanyCardData, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.every((token) => company.searchHaystack.includes(token));
}

function matchesRole(company: CompanyCardData, role: CompanyRoleFilter): boolean {
  switch (role) {
    case "publishers":
      return company.roleKind === "publisher";
    case "developers":
      return company.roleKind === "developer";
    case "both":
      return company.roleKind === "both";
    default:
      return true;
  }
}

function matchesMarket(company: CompanyCardData, market: CompanyMarketFilter): boolean {
  switch (market) {
    case "major":
      return company.gameCount >= MAJOR_CATALOG_MIN;
    case "collectible":
      return company.grailCount > 0;
    case "priced":
      return company.pricedCount > 0;
    default:
      return true;
  }
}

function sortCompanies(list: CompanyCardData[], sort: CompanySort): CompanyCardData[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      case "name-desc":
        return b.name.localeCompare(a.name, "es", { sensitivity: "base" });
      case "games-asc":
        return a.gameCount - b.gameCount || a.name.localeCompare(b.name, "es");
      case "games-desc":
        return b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es");
      case "market-desc":
        return (
          b.marketScore - a.marketScore ||
          b.grailCount - a.grailCount ||
          b.gameCount - a.gameCount ||
          a.name.localeCompare(b.name, "es")
        );
      case "dev-desc":
        return (
          b.developerCount - a.developerCount ||
          b.gameCount - a.gameCount ||
          a.name.localeCompare(b.name, "es")
        );
      case "pub-desc":
        return (
          b.publisherCount - a.publisherCount ||
          b.gameCount - a.gameCount ||
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
    `${stats.gamesWithDetails.toLocaleString("es-ES")} juegos con ficha`,
  ].join(" · ");
}
