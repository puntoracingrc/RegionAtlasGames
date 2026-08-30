import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  PRICE_FILTER_OPTIONS,
  filterCatalogGames,
  type CatalogPriceFilter,
  type CatalogPriceType,
  type CatalogSort,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { getCatalogByPlatformWithOverlay } from "@/lib/catalog-runtime-overlay";
import { isPublicPlatformSlug } from "@/lib/catalog";
import type { CatalogListGame } from "@/lib/types";

type PlatformSearchCacheEntry = {
  games: CatalogListGame[];
  createdAt: number;
};

const PLATFORM_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};
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
  if (!isPublicPlatformSlug(slug)) {
    return NextResponse.json({ items: [], total: 0 }, { status: 404, headers: PUBLIC_CACHE_HEADERS });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const region = url.searchParams.get("region") ?? "all";
  const genre = url.searchParams.get("genre") ?? "all";
  const subgenre = url.searchParams.get("subgenre") ?? "all";
  const facet = url.searchParams.get("facet") ?? "all";
  const company = url.searchParams.get("company") ?? "";
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceType = (url.searchParams.get("priceType") ?? "recommended") as CatalogPriceType;
  const priceFilterParam = url.searchParams.get("priceFilter") ?? "all";
  const priceFilter = PRICE_FILTER_OPTIONS.some((option) => option.value === priceFilterParam)
    ? (priceFilterParam as CatalogPriceFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const { games } = await getPlatformSearchData(slug);
  const filtered = filterCatalogGames(
    games,
    { q, region, platform: "all", sort, priceType, priceFilter, genre, subgenre, facet, company, queryScope: "game" },
    { regions: true, platforms: false },
  );
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  return NextResponse.json({
    items: filtered.items.slice(start, start + CATALOG_PAGE_SIZE).map(toCatalogCardGame),
    total: filtered.total,
  }, { headers: PUBLIC_CACHE_HEADERS });
}
