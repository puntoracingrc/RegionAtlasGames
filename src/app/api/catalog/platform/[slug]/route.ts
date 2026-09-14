import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_PRICE_TYPE,
  DEFAULT_SORT,
  PRICE_FILTER_OPTIONS,
  filterCatalogGames,
  normalizeCatalogPriceTypeForPlatform,
  type CatalogPriceFilter,
  type CatalogPriceType,
  type CatalogSort,
} from "@/lib/catalog-filters";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { enrichCatalogCards } from "@/lib/catalog-card-enrichment";
import { toCatalogListGameShell } from "@/lib/catalog-list-game-shell";
import { getCatalogByPlatformWithOverlay, getCatalogOverlayRevision } from "@/lib/catalog-runtime-overlay";
import { isPublicPlatformSlug } from "@/lib/catalog";
import type { CatalogListGame } from "@/lib/types";
import { isDefaultCatalogGame, parsePendingEdition } from "@/lib/catalog-review-policy";
import { groupCatalogListGames } from "@/lib/catalog-physical-edition-browse";
import { parseCatalogBroadRegion, parseCatalogPhysicalEditionType } from "@/lib/catalog-edition-guide-types";

type PlatformSearchCacheEntry = {
  games: Promise<CatalogListGame[]>;
  revision: string;
};

type PlatformBrowseData = {
  games: CatalogListGame[];
  reviewGames: CatalogListGame[];
};

type PlatformBrowseCacheEntry = {
  data: Promise<PlatformBrowseData>;
  revision: string;
};

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};
const platformBrowseCache = new Map<string, PlatformBrowseCacheEntry>();
const platformSearchCache = new Map<string, PlatformSearchCacheEntry>();

async function getPlatformBrowseData(slug: string): Promise<PlatformBrowseData> {
  const revision = await getCatalogOverlayRevision();
  const cached = platformBrowseCache.get(slug);
  const entry = cached?.revision === revision
    ? cached
    : {
      revision,
      data: getCatalogByPlatformWithOverlay(slug).then((catalog) => ({
        games: groupCatalogListGames(
          catalog.filter(isDefaultCatalogGame).map(toCatalogListGameShell),
          { mergeSearchMetadata: false },
        ),
        reviewGames: groupCatalogListGames(catalog.map(toCatalogListGameShell), {
          mergeSearchMetadata: false,
        }),
      })),
    };
  if (entry !== cached) platformBrowseCache.set(slug, entry);
  try {
    return await entry.data;
  } catch (error) {
    if (platformBrowseCache.get(slug) === entry) platformBrowseCache.delete(slug);
    throw error;
  }
}

async function getPlatformSearchData(slug: string): Promise<CatalogListGame[]> {
  const revision = await getCatalogOverlayRevision();
  const cached = platformSearchCache.get(slug);
  const entry = cached?.revision === revision
    ? cached
    : {
      revision,
      games: Promise.all([getCatalogByPlatformWithOverlay(slug), import("@/lib/catalog-list-game")])
        .then(([catalog, { toCatalogListGame }]) => groupCatalogListGames(catalog.map(toCatalogListGame))),
      };
  if (entry !== cached) platformSearchCache.set(slug, entry);
  try {
    return await entry.games;
  } catch (error) {
    if (platformSearchCache.get(slug) === entry) platformSearchCache.delete(slug);
    throw error;
  }
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
  const includePending = url.searchParams.get("includePending") === "1";
  const pendingEdition = parsePendingEdition(url.searchParams.get("pendingEdition"));
  const region = url.searchParams.get("region") ?? "all";
  const genre = url.searchParams.get("genre") ?? "all";
  const subgenre = url.searchParams.get("subgenre") ?? "all";
  const facet = url.searchParams.get("facet") ?? "all";
  const company = url.searchParams.get("company") ?? "";
  const broadRegion = parseCatalogBroadRegion(url.searchParams.get("broadRegion"));
  const ratingSystem = url.searchParams.get("ratingSystem") ?? "all";
  const physicalEditionType = parseCatalogPhysicalEditionType(url.searchParams.get("physicalEditionType"));
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceType = normalizeCatalogPriceTypeForPlatform(
    (url.searchParams.get("priceType") ?? DEFAULT_CATALOG_PRICE_TYPE) as CatalogPriceType,
    slug,
  );
  const priceFilterParam = url.searchParams.get("priceFilter") ?? "all";
  const priceFilter = PRICE_FILTER_OPTIONS.some((option) => option.value === priceFilterParam)
    ? (priceFilterParam as CatalogPriceFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const needsFullIndex = Boolean(q.trim() || company.trim() || genre !== "all" || subgenre !== "all" || facet !== "all") ||
    sort.startsWith("year-") ||
    sort.startsWith("reference-") ||
    sort.startsWith("genre-");
  const browseData = needsFullIndex ? null : await getPlatformBrowseData(slug);
  const games = browseData
    ? includePending ? browseData.reviewGames : browseData.games
    : await getPlatformSearchData(slug);
  const filtered = filterCatalogGames(
    games,
    { q, region, platform: "all", sort, priceType, priceFilter, genre, subgenre, facet, company, queryScope: "game", includePending, pendingEdition, broadRegion, ratingSystem, physicalEditionType },
    { regions: true, platforms: false },
  );
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const pageItems = filtered.items.slice(start, start + CATALOG_PAGE_SIZE);
  const reviewCounts = browseData && !includePending
    ? {
      ...filterCatalogGames(
        browseData.reviewGames,
        { q, region, platform: "all", sort, priceType, priceFilter, genre, subgenre, facet, company, queryScope: "game", includePending, pendingEdition, broadRegion, ratingSystem, physicalEditionType },
        { regions: true, platforms: false },
      ).reviewCounts,
      documented: filtered.reviewCounts.documented,
    }
    : filtered.reviewCounts;
  return NextResponse.json({
    items: needsFullIndex ? pageItems.map(toCatalogCardGame) : await enrichCatalogCards(pageItems),
    total: filtered.total,
    reviewCounts,
  }, { headers: PUBLIC_CACHE_HEADERS });
}
