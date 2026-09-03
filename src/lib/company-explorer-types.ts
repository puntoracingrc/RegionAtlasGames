export type CompanyRoleKind = "publisher" | "developer" | "both";

export type CompanyRoleFilter = "all" | "publishers" | "developers" | "both";
export type CompanyMarketFilter = "all" | "collectible" | "priced" | "unpriced";
export type CompanyCatalogSizeFilter =
  | "all"
  | "micro"
  | "small"
  | "medium"
  | "large"
  | "major";
export type CompanyStatusFilter = "all" | "active" | "defunct" | "subsidiary" | "unknown";
export type CompanyActivityFilter =
  | "all"
  | "pre-1980"
  | "1980s"
  | "1990s"
  | "2000s"
  | "2010s"
  | "2020s"
  | "unknown";

export type CompanySort =
  | "name-asc"
  | "name-desc"
  | "games-desc"
  | "games-asc"
  | "market-desc"
  | "median-desc"
  | "grails-desc"
  | "recent-desc"
  | "dev-desc"
  | "pub-desc";

export type CompanyIndexFilters = {
  q: string;
  initial: string;
  role: CompanyRoleFilter;
  platform: string;
  genre: string;
  size: CompanyCatalogSizeFilter;
  status: CompanyStatusFilter;
  activity: CompanyActivityFilter;
  market: CompanyMarketFilter;
  sort: CompanySort;
};

export const DEFAULT_COMPANY_FILTERS: CompanyIndexFilters = {
  q: "",
  initial: "all",
  role: "all",
  platform: "all",
  genre: "all",
  size: "all",
  status: "all",
  activity: "all",
  market: "all",
  sort: "name-asc",
};

export const COMPANY_SORT_OPTIONS: { value: CompanySort; label: string }[] = [
  { value: "name-asc", label: "Nombre (A → Z)" },
  { value: "name-desc", label: "Nombre (Z → A)" },
  { value: "games-desc", label: "Más juegos en catálogo" },
  { value: "pub-desc", label: "Más títulos publicados" },
  { value: "dev-desc", label: "Más títulos desarrollados" },
  { value: "median-desc", label: "Mayor precio mediano" },
  { value: "market-desc", label: "Mayor valor acumulado" },
  { value: "grails-desc", label: "Más títulos de alto valor" },
  { value: "recent-desc", label: "Actividad más reciente" },
  { value: "games-asc", label: "Menos juegos en catálogo" },
];

export const COMPANY_SIZE_OPTIONS: { value: CompanyCatalogSizeFilter; label: string }[] = [
  { value: "all", label: "Cualquier tamaño" },
  { value: "micro", label: "1-4 juegos" },
  { value: "small", label: "5-19 juegos" },
  { value: "medium", label: "20-49 juegos" },
  { value: "large", label: "50-199 juegos" },
  { value: "major", label: "200 o más juegos" },
];

export const COMPANY_STATUS_OPTIONS: { value: CompanyStatusFilter; label: string }[] = [
  { value: "all", label: "Cualquier estado" },
  { value: "active", label: "Activa (documentado)" },
  { value: "defunct", label: "Cerrada (documentado)" },
  { value: "subsidiary", label: "Filial (documentado)" },
  { value: "unknown", label: "Estado sin documentar" },
];

export const COMPANY_ACTIVITY_OPTIONS: { value: CompanyActivityFilter; label: string }[] = [
  { value: "all", label: "Cualquier periodo" },
  { value: "pre-1980", label: "Antes de 1980" },
  { value: "1980s", label: "Años 80" },
  { value: "1990s", label: "Años 90" },
  { value: "2000s", label: "Años 2000" },
  { value: "2010s", label: "Años 2010" },
  { value: "2020s", label: "Años 2020" },
  { value: "unknown", label: "Sin fecha documentada" },
];

export const COMPANY_MARKET_OPTIONS: { value: CompanyMarketFilter; label: string }[] = [
  { value: "all", label: "Cualquier cobertura" },
  { value: "priced", label: "Con precios" },
  { value: "collectible", label: "Con títulos de alto valor" },
  { value: "unpriced", label: "Sin precios" },
];

export const COMPANY_ROLE_FILTER_VALUES: CompanyRoleFilter[] = [
  "all",
  "publishers",
  "developers",
  "both",
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
  medianPrice: number | null;
  grailCount: number;
  pricedCount: number;
  firstReleaseYear: number | null;
  latestReleaseYear: number | null;
  activityPeriods: CompanyActivityFilter[];
  companyStatus: Exclude<CompanyStatusFilter, "all">;
  hasProfile: boolean;
  searchHaystack: string;
};

export type CompanyFilterOption = { slug: string; name: string; count: number };

export type CompanyExplorerData = {
  companies: CompanyCardData[];
  platformOptions: CompanyFilterOption[];
  genreOptions: CompanyFilterOption[];
  filterCounts: {
    status: Record<Exclude<CompanyStatusFilter, "all">, number>;
    activity: Record<Exclude<CompanyActivityFilter, "all">, number>;
  };
  stats: {
    total: number;
    publishers: number;
    developers: number;
    dualRole: number;
    withProfile: number;
    gamesWithDetails: number;
  };
};

export function hasActiveCompanyFilters(filters: CompanyIndexFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.initial !== "all" ||
    filters.role !== "all" ||
    filters.platform !== "all" ||
    filters.genre !== "all" ||
    filters.size !== "all" ||
    filters.status !== "all" ||
    filters.activity !== "all" ||
    filters.market !== "all" ||
    filters.sort !== DEFAULT_COMPANY_FILTERS.sort
  );
}
