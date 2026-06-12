import { hasVerifiedEsPrice, esPriceDisplayLabel } from "@/lib/price-display";
import { getPlatform } from "@/lib/catalog";
import { getGameDetails } from "@/lib/indexes";
import type { CatalogGame, GameDetails } from "@/lib/types";

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
  { value: "price-asc", label: "Precio ES (menor → mayor)" },
  { value: "price-desc", label: "Precio ES (mayor → menor)" },
  { value: "reference-asc", label: "Referencia / SKU (A → Z)" },
  { value: "reference-desc", label: "Referencia / SKU (Z → A)" },
  { value: "genre-asc", label: "Género (A → Z)" },
  { value: "genre-desc", label: "Género (Z → A)" },
  { value: "region-asc", label: "Región (A → Z)" },
  { value: "region-desc", label: "Región (Z → A)" },
];

export const DEFAULT_SORT: CatalogSort = "title-asc";
export const CATALOG_PAGE_SIZE = 120;

export type CatalogPriceFilter = "all" | "verified" | "unverified" | "pending";

export const PRICE_FILTER_OPTIONS: { value: CatalogPriceFilter; label: string }[] = [
  { value: "all", label: "Todos los precios" },
  { value: "verified", label: "Precio ES verificado" },
  { value: "unverified", label: "Precio sin verificar región" },
  { value: "pending", label: "Precio pendiente" },
];

export function matchesPriceFilter(game: CatalogGame, filter: CatalogPriceFilter): boolean {
  if (filter === "all") return true;
  const status = esPriceDisplayLabel(game);
  if (filter === "verified") return status === "verified";
  if (filter === "unverified") return status === "unverified";
  return status === "pending";
}

export function countByPriceFilter(games: CatalogGame[]): Record<CatalogPriceFilter, number> {
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

export function getDetails(game: CatalogGame): GameDetails | undefined {
  return getGameDetails(game.id);
}

export function buildSearchHaystack(game: CatalogGame): string {
  const d = getDetails(game);
  const platform = getPlatform(game.platformSlug);
  const parts = [
    game.title,
    game.titlePc,
    game.slug,
    game.id,
    game.region,
    game.edition,
    game.museumSlug,
    game.museumRegion,
    platform?.name,
    platform?.shortName,
    game.platformSlug,
    d?.reference,
    d?.support,
    d?.releaseDate,
    d?.developer?.name,
    d?.developer?.slug,
    d?.publisher?.name,
    d?.publisher?.slug,
    d?.series?.name,
    d?.series?.slug,
    d?.players != null ? String(d.players) : null,
    ...(d?.genres?.map((g) => `${g.name} ${g.slug}`) ?? []),
  ];
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function matchesQuery(game: CatalogGame, rawQuery: string): boolean {
  const query = rawQuery
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!query) return true;

  const haystack = buildSearchHaystack(game);
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function genreKey(game: CatalogGame): string {
  const g = getDetails(game)?.genres?.[0]?.name;
  return g?.toLowerCase() ?? "\uffff";
}

function referenceKey(game: CatalogGame): string {
  return getDetails(game)?.reference?.toLowerCase() ?? game.slug;
}

function yearKey(game: CatalogGame): number | null {
  return getDetails(game)?.year ?? null;
}

function priceKey(game: CatalogGame): number | null {
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

export function sortCatalogGames(games: CatalogGame[], sort: CatalogSort): CatalogGame[] {
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
        return compareNullsLast(priceKey(a), priceKey(b), true);
      case "price-desc":
        return compareNullsLast(priceKey(a), priceKey(b), false);
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
  priceFilter: CatalogPriceFilter;
};

export function filterCatalogGames(
  games: CatalogGame[],
  { q, region, platform, sort, priceFilter }: CatalogFilterState,
  options?: { regions?: boolean; platforms?: boolean },
): { items: CatalogGame[]; total: number } {
  let list = games;

  if (options?.regions !== false && region !== "all") {
    list = list.filter((g) => g.region === region);
  }
  if (options?.platforms && platform !== "all") {
    list = list.filter((g) => g.platformSlug === platform);
  }
  if (priceFilter !== "all") {
    list = list.filter((g) => matchesPriceFilter(g, priceFilter));
  }
  if (q.trim()) {
    list = list.filter((g) => matchesQuery(g, q));
  }

  list = sortCatalogGames(list, sort);

  return {
    items: list,
    total: list.length,
  };
}

export function regionOptions(games: CatalogGame[]) {
  const counts = new Map<string, number>();
  for (const game of games) {
    const label = game.region || "Desconocida";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function platformOptions(games: CatalogGame[]) {
  const counts = new Map<string, number>();
  for (const game of games) {
    counts.set(game.platformSlug, (counts.get(game.platformSlug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      name: getPlatform(slug)?.shortName ?? slug,
    }))
    .sort((a, b) => b.count - a.count);
}
