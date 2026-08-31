import { catalogSearchTokens } from "@/lib/catalog-search-normalize";
import { findGameFacetEntityBySlug, getGameFacetsTaxonomy } from "@/lib/game-facets/taxonomy";
import { hasVerifiedEsPrice, esPriceDisplayLabel } from "@/lib/price-display";
import { regionSortRank } from "@/lib/platform-catalog-insights";
import { getRegionDisplay } from "@/lib/region-display";
import type { CatalogListGame } from "@/lib/types";

export type CatalogSort =
  | "title-asc"
  | "title-desc"
  | "year-asc"
  | "year-desc"
  | "price-asc"
  | "price-desc"
  | "reference-asc"
  | "reference-desc"
  | "genre-asc"
  | "genre-desc"
  | "region-asc"
  | "region-desc";

export const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "title-asc", label: "Nombre (A → Z)" },
  { value: "title-desc", label: "Nombre (Z → A)" },
  { value: "year-asc", label: "Año (antiguo → reciente)" },
  { value: "year-desc", label: "Año (reciente → antiguo)" },
  { value: "price-asc", label: "Precio (menor → mayor)" },
  { value: "price-desc", label: "Precio (mayor → menor)" },
  { value: "reference-asc", label: "Referencia / SKU (A → Z)" },
  { value: "reference-desc", label: "Referencia / SKU (Z → A)" },
  { value: "genre-asc", label: "Género (A → Z)" },
  { value: "genre-desc", label: "Género (Z → A)" },
  { value: "region-asc", label: "Región (A → Z)" },
  { value: "region-desc", label: "Región (Z → A)" },
];

export const DEFAULT_SORT: CatalogSort = "title-asc";
export const CATALOG_PAGE_SIZE = 48;

export type CatalogPriceType = "recommended" | "sealed" | "newRetail" | "complete" | "gameManual" | "loose";

export const PRICE_TYPE_OPTIONS: { value: CatalogPriceType; label: string }[] = [
  { value: "recommended", label: "Precio recomendado" },
  { value: "sealed", label: "Precintado" },
  { value: "newRetail", label: "Nuevo en tienda" },
  { value: "complete", label: "Completo" },
  { value: "gameManual", label: "Juego + manual" },
  { value: "loose", label: "Suelto" },
];

export type CatalogPriceFilter = "all" | "verified" | "unverified" | "pending";

export const PRICE_FILTER_OPTIONS: { value: CatalogPriceFilter; label: string }[] = [
  { value: "all", label: "Todos los precios" },
  { value: "verified", label: "Precio verificado" },
  { value: "unverified", label: "Precio sin verificar región" },
  { value: "pending", label: "Precio pendiente" },
];

export function matchesPriceFilter(game: CatalogListGame, filter: CatalogPriceFilter): boolean {
  if (filter === "all") return true;
  const status = esPriceDisplayLabel(game);
  if (filter === "verified") return status === "verified";
  if (filter === "unverified") return status === "unverified";
  return status === "pending";
}

export function countByPriceFilter(games: CatalogListGame[]): Record<CatalogPriceFilter, number> {
  const counts: Record<CatalogPriceFilter, number> = {
    all: games.length,
    verified: 0,
    unverified: 0,
    pending: 0,
  };
  for (const game of games) {
    const status = esPriceDisplayLabel(game);
    if (status === "verified") counts.verified += 1;
    else if (status === "unverified") counts.unverified += 1;
    else counts.pending += 1;
  }
  return counts;
}

export function buildSearchHaystack(game: CatalogListGame): string {
  if (game.searchText) return game.searchText;
  const parts = [
    game.title,
    game.slug,
    game.id,
    game.region,
    game.platformSlug,
  ];
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function matchesQuery(game: CatalogListGame, rawQuery: string): boolean {
  const tokens = catalogSearchTokens(rawQuery);
  if (!tokens.length) return true;

  const haystack = buildSearchHaystack(game);
  return matchesTokens(haystack, tokens);
}

function matchesScopedQuery(game: CatalogListGame, rawQuery: string, scope: CatalogFilterState["queryScope"]): boolean {
  const tokens = catalogSearchTokens(rawQuery);
  if (!tokens.length) return true;

  const haystack = scope === "game" ? game.gameSearchText || buildSearchHaystack(game) : buildSearchHaystack(game);
  return matchesTokens(haystack, tokens);
}

function matchesCompany(game: CatalogListGame, rawCompany: string | undefined): boolean {
  const tokens = catalogSearchTokens(rawCompany ?? "");
  if (!tokens.length || rawCompany === "all") return true;
  return matchesTokens(game.companySearchText ?? "", tokens);
}

function matchesTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => {
    if (haystack.includes(token)) return true;
    const compact = token.replace(/-/g, "");
    return compact.length >= 3 && haystack.includes(compact);
  });
}

function genreKey(game: CatalogListGame): string {
  return game.sortGenre || "\uffff";
}

function referenceKey(game: CatalogListGame): string {
  return game.sortReference || game.slug || game.id;
}

function yearKey(game: CatalogListGame): number | null {
  if (game.displayYear != null) return game.displayYear;
  return null;
}

function priceKey(game: CatalogListGame, priceType: CatalogPriceType): number | null {
  if (priceType === "sealed") return game.estimatedPriceSealed ?? null;
  if (priceType === "newRetail") return game.estimatedPriceNewRetail ?? null;
  if (priceType === "complete") return game.estimatedPriceComplete ?? null;
  if (priceType === "gameManual") return game.estimatedPriceGameManual ?? null;
  if (priceType === "loose") return game.estimatedPriceLoose ?? null;
  if (hasVerifiedEsPrice(game) && game.recommendedPrice != null) {
    return game.recommendedPrice;
  }
  return null;
}

function compareNullsLast(a: number | null, b: number | null, asc: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return asc ? a - b : b - a;
}

export function sortCatalogListGames(
  games: CatalogListGame[],
  sort: CatalogSort,
  priceType: CatalogPriceType = "recommended",
): CatalogListGame[] {
  const sorted = [...games];
  sorted.sort((a, b) => {
    switch (sort) {
      case "title-asc":
        return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
      case "title-desc":
        return b.title.localeCompare(a.title, "es", { sensitivity: "base" });
      case "year-asc":
        return compareNullsLast(yearKey(a), yearKey(b), true);
      case "year-desc":
        return compareNullsLast(yearKey(a), yearKey(b), false);
      case "price-asc":
        return compareNullsLast(priceKey(a, priceType), priceKey(b, priceType), true);
      case "price-desc":
        return compareNullsLast(priceKey(a, priceType), priceKey(b, priceType), false);
      case "reference-asc":
        return referenceKey(a).localeCompare(referenceKey(b), "es", { sensitivity: "base" });
      case "reference-desc":
        return referenceKey(b).localeCompare(referenceKey(a), "es", { sensitivity: "base" });
      case "genre-asc":
        return genreKey(a).localeCompare(genreKey(b), "es", { sensitivity: "base" });
      case "genre-desc":
        return genreKey(b).localeCompare(genreKey(a), "es", { sensitivity: "base" });
      case "region-asc":
        return a.region.localeCompare(b.region, "es", { sensitivity: "base" });
      case "region-desc":
        return b.region.localeCompare(a.region, "es", { sensitivity: "base" });
      default:
        return 0;
    }
  });
  return sorted;
}

export type CatalogFilterState = {
  q: string;
  region: string;
  platform: string;
  sort: CatalogSort;
  priceType?: CatalogPriceType;
  priceFilter: CatalogPriceFilter;
  genre?: string;
  subgenre?: string;
  facet?: string;
  company?: string;
  queryScope?: "full" | "game";
};

export type CatalogTaxonomyFilterOption = {
  slug: string;
  name: string;
  count?: number;
};

export type CatalogCompanyFilterOption = {
  value: string;
  name: string;
  count?: number;
};

export type CatalogPlatformFilterOption = {
  slug: string;
  name: string;
  count?: number;
};

export type CatalogRegionFilterOption = {
  value: string;
  label: string;
  count?: number;
};

function matchesSlugFilter(slugs: string[] | undefined, selected: string | undefined): boolean {
  if (!selected || selected === "all") return true;
  return slugs?.includes(selected) ?? false;
}

export function filterCatalogGames(
  games: CatalogListGame[],
  {
    q,
    region,
    platform,
    sort,
    priceType = "recommended",
    priceFilter,
    genre = "all",
    subgenre = "all",
    facet = "all",
    company = "",
    queryScope = "full",
  }: CatalogFilterState,
  options?: { regions?: boolean; platforms?: boolean },
): { items: CatalogListGame[]; total: number } {
  let list = games;

  if (options?.regions !== false && region !== "all") {
    list = list.filter((g) => getRegionDisplay(g.region).label === region);
  }
  if (options?.platforms && platform !== "all") {
    list = list.filter((g) => g.platformSlug === platform);
  }
  if (priceFilter !== "all") {
    list = list.filter((g) => matchesPriceFilter(g, priceFilter));
  }
  if (genre !== "all") {
    list = list.filter((g) => matchesSlugFilter(g.genreSlugs, genre));
  }
  if (subgenre !== "all") {
    list = list.filter((g) => matchesSlugFilter(g.subgenreSlugs, subgenre));
  }
  if (facet !== "all") {
    list = list.filter((g) => matchesSlugFilter(g.facetSlugs, facet));
  }
  if (company.trim()) {
    list = list.filter((g) => matchesCompany(g, company));
  }
  if (q.trim()) {
    list = list.filter((g) => matchesScopedQuery(g, q, queryScope));
  }

  list = sortCatalogListGames(list, sort, priceType);

  return {
    items: list,
    total: list.length,
  };
}

export function regionOptions(games: CatalogListGame[]) {
  const counts = new Map<string, number>();
  for (const game of games) {
    const label = getRegionDisplay(game.region).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    const rankDiff = regionSortRank(a[0]) - regionSortRank(b[0]);
    if (rankDiff !== 0) return rankDiff;
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "es");
  });
}

export function platformOptions(games: CatalogListGame[]) {
  const counts = new Map<string, number>();
  for (const game of games) {
    counts.set(game.platformSlug, (counts.get(game.platformSlug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      name: slug.toUpperCase(),
    }))
    .sort((a, b) => b.count - a.count);
}

const PUBLIC_REGION_LABELS = [
  "PAL España",
  "PAL Europa",
  "NTSC USA",
  "NTSC-J Japón",
  "Australia",
  "PAL UK",
  "PAL Alemania",
];

export function publicRegionFilterOptions(): CatalogRegionFilterOption[] {
  return PUBLIC_REGION_LABELS.map((label) => ({ value: label, label }));
}

function publicTaxonomyOptionsFor(type: "genre" | "subgenre" | "facet"): CatalogTaxonomyFilterOption[] {
  const taxonomy = getGameFacetsTaxonomy();
  const entities =
    type === "genre"
      ? taxonomy.genres
      : type === "subgenre"
        ? taxonomy.subgenres
        : taxonomy.facets;
  return entities
    .filter((entity) => entity.status === "approved" && entity.publicEligible !== false)
    .map((entity) => ({ slug: entity.slug, name: entity.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

export function publicGenreFilterOptions(): CatalogTaxonomyFilterOption[] {
  return publicTaxonomyOptionsFor("genre");
}

export function publicSubgenreFilterOptions(): CatalogTaxonomyFilterOption[] {
  return publicTaxonomyOptionsFor("subgenre");
}

export function publicFacetFilterOptions(): CatalogTaxonomyFilterOption[] {
  return publicTaxonomyOptionsFor("facet");
}

function taxonomyOptionsFor(games: CatalogListGame[], field: "genreSlugs" | "subgenreSlugs" | "facetSlugs"): CatalogTaxonomyFilterOption[] {
  const counts = new Map<string, number>();
  for (const game of games) {
    for (const slug of game[field] ?? []) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      name: findGameFacetEntityBySlug(slug)?.name ?? slug,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

export function genreFilterOptions(games: CatalogListGame[]): CatalogTaxonomyFilterOption[] {
  return taxonomyOptionsFor(games, "genreSlugs");
}

export function subgenreFilterOptions(games: CatalogListGame[]): CatalogTaxonomyFilterOption[] {
  return taxonomyOptionsFor(games, "subgenreSlugs");
}

export function facetFilterOptions(games: CatalogListGame[]): CatalogTaxonomyFilterOption[] {
  return taxonomyOptionsFor(games, "facetSlugs");
}

export function companyFilterOptions(games: CatalogListGame[]): CatalogCompanyFilterOption[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const game of games) {
    for (const company of game.companies ?? []) {
      const name = company.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { name, count: 1 });
    }
  }

  return [...counts.values()]
    .map((entry) => ({ value: entry.name, name: entry.name, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}
