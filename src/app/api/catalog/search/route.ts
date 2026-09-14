import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_PRICE_TYPE,
  DEFAULT_SORT,
  filterCatalogGames,
  normalizeCatalogPriceTypeForPlatform,
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicSubgenreFilterOptions,
  type CatalogPriceFilter,
  type CatalogPriceType,
  type CatalogSort,
  type CatalogTaxonomyFilterOption,
} from "@/lib/catalog-filters";
import {
  normalizeCatalogSearchText,
} from "@/lib/catalog-search-normalize";
import { getPlatform } from "@/lib/catalog";
import { enrichCatalogCards } from "@/lib/catalog-card-enrichment";
import { toCatalogListGameShell } from "@/lib/catalog-list-game-shell";
import { toCatalogQuickSearchGame } from "@/lib/catalog-quick-search-game";
import { getCatalogOverlayRevision, getPublicCatalogWithOverlay } from "@/lib/catalog-runtime-overlay";
import { catalogGamePath } from "@/lib/catalog-seo";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { CatalogListGame } from "@/lib/types";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { isDefaultCatalogGame, parsePendingEdition } from "@/lib/catalog-review-policy";
import { groupCatalogListGames } from "@/lib/catalog-physical-edition-browse";
import { parseCatalogBroadRegion, parseCatalogPhysicalEditionType } from "@/lib/catalog-edition-guide-types";

const MAX_RESULTS = 12;
const MAX_TAXONOMY_OPTIONS = 16;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};
let quickSearchGamesCache: { revision: string; games: Promise<CatalogListGame[]> } | null = null;
type BrowseGamesData = {
  games: CatalogListGame[];
  reviewGames: CatalogListGame[];
};
const browseGamesCache = new Map<"all" | "default", { revision: string; data: Promise<BrowseGamesData> }>();
const editorialSearchGamesCache = new Map<"filter" | "search", {
  revision: string;
  games: Promise<CatalogListGame[]>;
}>();
let taxonomyQueryCache: Set<string> | null = null;

type SearchResult = {
  id: string;
  title: string;
  href: string;
  platform: string;
  platformSlug: string;
  region: string;
  year: number | null;
  price: number | null;
  coverUrl: string | null;
};

async function browseGames(includePending: boolean): Promise<BrowseGamesData> {
  const scope = includePending ? "all" : "default";
  const revision = await getCatalogOverlayRevision();
  const cached = browseGamesCache.get(scope);
  const current = cached?.revision === revision
    ? cached
    : {
      revision,
      data: getPublicCatalogWithOverlay().then((catalog) => {
        const reviewGames = groupCatalogListGames(catalog.map(toCatalogListGameShell), {
          mergeSearchMetadata: false,
        });
        return {
          games: includePending
            ? reviewGames
            : groupCatalogListGames(
              catalog.filter(isDefaultCatalogGame).map(toCatalogListGameShell),
              { mergeSearchMetadata: false },
            ),
          reviewGames,
        };
      }),
    };
  if (current !== cached) browseGamesCache.set(scope, current);
  try {
    return await current.data;
  } catch (error) {
    if (browseGamesCache.get(scope) === current) browseGamesCache.delete(scope);
    throw error;
  }
}

async function quickSearchGames(): Promise<CatalogListGame[]> {
  const revision = await getCatalogOverlayRevision();
  if (!quickSearchGamesCache || quickSearchGamesCache.revision !== revision) {
    quickSearchGamesCache = {
      revision,
      games: getPublicCatalogWithOverlay()
        .then((catalog) => groupCatalogListGames(catalog.map(toCatalogQuickSearchGame))),
    };
  }
  const current = quickSearchGamesCache;
  try {
    return await current.games;
  } catch (error) {
    if (quickSearchGamesCache === current) quickSearchGamesCache = null;
    throw error;
  }
}

async function editorialSearchGames(includeSearchText: boolean): Promise<CatalogListGame[]> {
  const scope = includeSearchText ? "search" : "filter";
  const revision = await getCatalogOverlayRevision();
  const cached = editorialSearchGamesCache.get(scope);
  const current = cached?.revision === revision
    ? cached
    : {
      revision,
      games: Promise.all([getPublicCatalogWithOverlay(), import("@/lib/catalog-editorial-filter-index")])
        .then(([catalog, editorialIndex]) => groupCatalogListGames(
          catalog.map(includeSearchText
            ? editorialIndex.toCatalogEditorialListGame
            : editorialIndex.toCatalogEditorialFilterGame),
          { mergeSearchText: includeSearchText },
        )),
    };
  if (current !== cached) editorialSearchGamesCache.set(scope, current);
  try {
    return await current.games;
  } catch (error) {
    if (editorialSearchGamesCache.get(scope) === current) editorialSearchGamesCache.delete(scope);
    throw error;
  }
}

function isKnownTaxonomyQuery(rawQuery: string): boolean {
  const query = normalizeCatalogSearchText(rawQuery);
  if (!query) return false;
  if (!taxonomyQueryCache) {
    taxonomyQueryCache = new Set(
      [
        ...publicGenreFilterOptions(),
        ...publicSubgenreFilterOptions(),
        ...publicFacetFilterOptions(),
      ].flatMap((option) => [
        normalizeCatalogSearchText(option.name),
        normalizeCatalogSearchText(option.slug),
      ]),
    );
  }
  return taxonomyQueryCache.has(query);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const includePending = url.searchParams.get("includePending") === "1";
  const pendingEdition = parsePendingEdition(url.searchParams.get("pendingEdition"));
  const platform = url.searchParams.get("platform") ?? "all";
  const region = url.searchParams.get("region") ?? "all";
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceType = normalizeCatalogPriceTypeForPlatform(
    (url.searchParams.get("priceType") ?? DEFAULT_CATALOG_PRICE_TYPE) as CatalogPriceType,
    platform,
  );
  const priceFilter = (url.searchParams.get("priceFilter") ?? "all") as CatalogPriceFilter;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const mode = url.searchParams.get("mode") ?? "quick";
  const taxonomyOptionsType = url.searchParams.get("type");
  const genreSlug = url.searchParams.get("genre") ?? "";
  const subgenreSlug = url.searchParams.get("subgenre") ?? "";
  const facetSlug = url.searchParams.get("facet") ?? "";
  const company = url.searchParams.get("company") ?? "";
  const broadRegion = parseCatalogBroadRegion(url.searchParams.get("broadRegion"));
  const ratingSystem = url.searchParams.get("ratingSystem") ?? "all";
  const physicalEditionType = parseCatalogPhysicalEditionType(url.searchParams.get("physicalEditionType"));
  const hasTaxonomyFilter = Boolean(genreSlug || subgenreSlug || facetSlug);

  if (mode === "taxonomy-options") {
    return NextResponse.json({
      items: taxonomyOptions(taxonomyOptionsType, q),
    }, { headers: PUBLIC_CACHE_HEADERS });
  }

  if (q.trim().length < 2 && platform === "all" && region === "all" && !hasTaxonomyFilter && mode !== "browser") {
    return NextResponse.json({ items: [], total: 0 }, { headers: PUBLIC_CACHE_HEADERS });
  }

  const needsEditorialIndex = mode === "browser"
    ? Boolean(company.trim() || hasTaxonomyFilter) ||
      sort.startsWith("year-") ||
      sort.startsWith("reference-") ||
      sort.startsWith("genre-")
    : hasTaxonomyFilter ||
      isKnownTaxonomyQuery(q) ||
      sort.startsWith("year-") ||
      sort.startsWith("reference-") ||
      sort.startsWith("genre-");
  const usesBrowseIndex = mode === "browser" && !needsEditorialIndex && !q.trim();
  let usesEditorialIndex = needsEditorialIndex;
  const browseData = usesBrowseIndex ? await browseGames(includePending) : null;
  let games = browseData?.games ?? (needsEditorialIndex ? await editorialSearchGames(Boolean(q.trim())) : await quickSearchGames());
  const filters = {
    q,
    platform,
    region,
    sort,
    priceType,
    priceFilter,
    includePending,
    pendingEdition,
    genre: genreSlug || "all",
    subgenre: subgenreSlug || "all",
    facet: facetSlug || "all",
    company,
    broadRegion,
    ratingSystem,
    physicalEditionType,
  };
  let filtered = filterCatalogGames(
    games,
    filters,
    { platforms: true, regions: true },
  );

  if (!needsEditorialIndex && q.trim() && filtered.total === 0) {
    games = await editorialSearchGames(true);
    usesEditorialIndex = true;
    filtered = filterCatalogGames(games, filters, { platforms: true, regions: true });
  }

  if (mode === "browser") {
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    const pageItems = filtered.items.slice(start, start + CATALOG_PAGE_SIZE);
    const reviewCounts = browseData && !includePending
      ? {
        ...filterCatalogGames(
          browseData.reviewGames,
          filters,
          { platforms: true, regions: true },
        ).reviewCounts,
        documented: filtered.reviewCounts.documented,
      }
      : filtered.reviewCounts;
    return NextResponse.json(
      {
        items: usesEditorialIndex ? pageItems.map(toCatalogCardGame) : await enrichCatalogCards(pageItems),
        total: filtered.total,
        reviewCounts,
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  }

  const rankedItems = q.trim()
    ? [...filtered.items].sort((a, b) => relevanceScore(b, q) - relevanceScore(a, q) || a.title.localeCompare(b.title, "es"))
    : filtered.items;
  const resultGames = rankedItems.slice(0, MAX_RESULTS);
  const displayGames = usesEditorialIndex ? resultGames : await enrichCatalogCards(resultGames);

  const items: SearchResult[] = displayGames.map((game) => {
    const platformData = getPlatform(game.platformSlug);
    return {
      id: game.id,
      title: decodeHtmlEntities(game.title),
      href: catalogGamePath(game),
      platform: platformData?.shortName ?? game.displayPlatform,
      platformSlug: game.platformSlug,
      region: game.region,
      year: game.displayYear,
      price: game.recommendedPrice,
      coverUrl: getCoverSrc(game.coverUrl, game.id),
    };
  });

  return NextResponse.json(
    {
      items,
      total: filtered.total,
    },
    { headers: PUBLIC_CACHE_HEADERS },
  );
}

function taxonomyOptions(type: string | null, rawQuery: string): CatalogTaxonomyFilterOption[] {
  if (type !== "subgenre" && type !== "facet") return [];

  const query = normalizeCatalogSearchText(rawQuery);
  const options = type === "subgenre" ? publicSubgenreFilterOptions() : publicFacetFilterOptions();
  const filtered = query
    ? options.filter((option) => {
        const name = normalizeCatalogSearchText(option.name);
        const slug = normalizeCatalogSearchText(option.slug);
        return name.includes(query) || slug.includes(query);
      })
    : options;

  return filtered.slice(0, MAX_TAXONOMY_OPTIONS);
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function relevanceScore(game: CatalogListGame, rawQuery: string): number {
  const query = normalizeSearchValue(rawQuery);
  const title = normalizeSearchValue(game.title);
  const slug = normalizeSearchValue(game.slug);
  const id = normalizeSearchValue(game.id);
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;

  if (title === query) score += 10000;
  if (title.startsWith(query)) score += 9000;
  if (title.includes(` ${query}`)) score += 8000;
  if (title.includes(query)) score += 7000;
  if (tokens.length && tokens.every((token) => title.includes(token))) score += 3000;
  if (slug.includes(query)) score += 1500;
  if (id.includes(query)) score += 1000;
  if (game.platformSlug === query) score += 300;
  if (game.recommendedPrice != null) score += 50;

  return score;
}
