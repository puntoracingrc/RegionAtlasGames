import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  PRICE_FILTER_OPTIONS,
  companyFilterOptions,
  countByPriceFilter,
  facetFilterOptions,
  filterCatalogGames,
  genreFilterOptions,
  regionOptions,
  subgenreFilterOptions,
  type CatalogPriceFilter,
  type CatalogSort,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { getCatalogByPlatformWithOverlay } from "@/lib/catalog-runtime-overlay";
import type { CatalogListGame } from "@/lib/types";

type PlatformSearchCacheEntry = {
  games: CatalogListGame[];
  regions: ReturnType<typeof regionOptions>;
  priceCounts: ReturnType<typeof countByPriceFilter>;
  createdAt: number;
};

const PLATFORM_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const platformSearchCache = new Map<string, PlatformSearchCacheEntry>();

async function getPlatformSearchData(slug: string): Promise<PlatformSearchCacheEntry> {
  const now = Date.now();
  const cached = platformSearchCache.get(slug);
  if (cached && now - cached.createdAt < PLATFORM_SEARCH_CACHE_TTL_MS) {
    return cached;
  }

  const games = (await getCatalogByPlatformWithOverlay(slug)).map(toCatalogListGame);
  const entry = {
    games,
    regions: regionOptions(games),
    priceCounts: countByPriceFilter(games),
    createdAt: now,
  };
  platformSearchCache.set(slug, entry);
  return entry;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const region = url.searchParams.get("region") ?? "all";
  const genre = url.searchParams.get("genre") ?? "all";
  const subgenre = url.searchParams.get("subgenre") ?? "all";
  const facet = url.searchParams.get("facet") ?? "all";
  const company = url.searchParams.get("company") ?? "";
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceFilterParam = url.searchParams.get("priceFilter") ?? "all";
  const priceFilter = PRICE_FILTER_OPTIONS.some((option) => option.value === priceFilterParam)
    ? (priceFilterParam as CatalogPriceFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const { games, regions, priceCounts } = await getPlatformSearchData(slug);
  const filtered = filterCatalogGames(
    games,
    { q, region, platform: "all", sort, priceFilter, genre, subgenre, facet, company, queryScope: "game" },
    { regions: true, platforms: false },
  );
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const baseFilters = {
    q,
    region,
    platform: "all",
    sort,
    priceFilter,
    genre,
    subgenre,
    facet,
    company,
    queryScope: "game" as const,
  };
  const dynamicRegions = regionOptions(
    filterCatalogGames(games, { ...baseFilters, region: "all" }, { regions: true, platforms: false }).items,
  );
  const taxonomyOptions = {
    genres: genreFilterOptions(
      filterCatalogGames(games, { ...baseFilters, genre: "all" }, { regions: true, platforms: false }).items,
    ),
    subgenres: subgenreFilterOptions(
      filterCatalogGames(games, { ...baseFilters, subgenre: "all" }, { regions: true, platforms: false }).items,
    ),
    facets: facetFilterOptions(
      filterCatalogGames(games, { ...baseFilters, facet: "all" }, { regions: true, platforms: false }).items,
    ),
    companies: companyFilterOptions(
      filterCatalogGames(games, { ...baseFilters, company: "" }, { regions: true, platforms: false }).items,
    ),
  };

  return NextResponse.json({
    items: filtered.items.slice(start, start + CATALOG_PAGE_SIZE),
    total: filtered.total,
    regions: dynamicRegions,
    baseRegions: regions,
    priceCounts,
    taxonomyOptions,
    matchedIds: filtered.items.map((game) => game.id),
  });
}
