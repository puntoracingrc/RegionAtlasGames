import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  PRICE_FILTER_OPTIONS,
  countByPriceFilter,
  filterCatalogGames,
  regionOptions,
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
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceFilterParam = url.searchParams.get("priceFilter") ?? "all";
  const priceFilter = PRICE_FILTER_OPTIONS.some((option) => option.value === priceFilterParam)
    ? (priceFilterParam as CatalogPriceFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const { games, regions, priceCounts } = await getPlatformSearchData(slug);
  const filtered = filterCatalogGames(
    games,
    { q, region, platform: "all", sort, priceFilter },
    { regions: true, platforms: false },
  );
  const start = (page - 1) * CATALOG_PAGE_SIZE;

  return NextResponse.json({
    items: filtered.items.slice(start, start + CATALOG_PAGE_SIZE),
    total: filtered.total,
    regions,
    priceCounts,
  });
}
