import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
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
  normalizeCatalogSearchParts,
  normalizeCatalogSearchText,
} from "@/lib/catalog-search-normalize";
import { getPlatform, publicListedCatalog } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-seo";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { CatalogGame, CatalogListGame } from "@/lib/types";
import { toCatalogCardGame } from "@/lib/catalog-card-game";

const MAX_RESULTS = 12;
const MAX_TAXONOMY_OPTIONS = 16;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};
let quickSearchGamesCache: CatalogListGame[] | null = null;
let fullSearchGamesCache: Promise<CatalogListGame[]> | null = null;
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

function toQuickSearchGame(game: CatalogGame): CatalogListGame {
  const platform = getPlatform(game.platformSlug);
  const searchText = normalizeCatalogSearchParts([
    game.title,
    game.titlePc,
    game.slug,
    game.id,
    game.region,
    game.edition,
    game.museumSlug,
    game.museumRegion,
    game.pcPath,
    game.pcRegion,
    game.pcCondition,
    game.pcId,
    platform?.name,
    platform?.shortName,
    game.platformSlug,
  ]);
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    physicalVariant: game.physicalVariant,
    coverUrl: game.coverUrl,
    recommendedPrice: game.recommendedPrice,
    estimatedPriceLoose: game.estimatedPriceLoose,
    estimatedPriceGameManual: game.estimatedPriceGameManual,
    estimatedPriceComplete: game.estimatedPriceComplete,
    estimatedPriceSealed: game.estimatedPriceSealed,
    estimatedPriceNewRetail: game.estimatedPriceNewRetail,
    pcRefPrice: game.pcRefPrice,
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    displayPlatform: platform?.shortName ?? game.platformSlug.toUpperCase(),
    displayYear: null,
    searchText,
    gameSearchText: searchText,
    companySearchText: "",
    companies: [],
    sortGenre: "\uffff",
    sortReference: game.slug || game.id,
    genreSlugs: [],
    subgenreSlugs: [],
    facetSlugs: [],
    isGrail: false,
    isTopSegment: false,
  };
}

function quickSearchGames(): CatalogListGame[] {
  if (!quickSearchGamesCache) {
    quickSearchGamesCache = publicListedCatalog.map(toQuickSearchGame);
  }
  return quickSearchGamesCache;
}

async function fullSearchGames(): Promise<CatalogListGame[]> {
  if (!fullSearchGamesCache) {
    fullSearchGamesCache = import("@/lib/catalog-list-game").then(({ toCatalogListGame }) =>
      publicListedCatalog.map(toCatalogListGame),
    );
  }
  return fullSearchGamesCache;
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
  const platform = url.searchParams.get("platform") ?? "all";
  const region = url.searchParams.get("region") ?? "all";
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceType = normalizeCatalogPriceTypeForPlatform(
    (url.searchParams.get("priceType") ?? "recommended") as CatalogPriceType,
    platform,
  );
  const priceFilter = (url.searchParams.get("priceFilter") ?? "all") as CatalogPriceFilter;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const mode = url.searchParams.get("mode") ?? "quick";
  const taxonomyOptionsType = url.searchParams.get("type");
  const genreSlug = url.searchParams.get("genre") ?? "";
  const subgenreSlug = url.searchParams.get("subgenre") ?? "";
  const facetSlug = url.searchParams.get("facet") ?? "";
  const hasTaxonomyFilter = Boolean(genreSlug || subgenreSlug || facetSlug);

  if (mode === "taxonomy-options") {
    return NextResponse.json({
      items: taxonomyOptions(taxonomyOptionsType, q),
    }, { headers: PUBLIC_CACHE_HEADERS });
  }

  if (q.trim().length < 2 && platform === "all" && region === "all" && !hasTaxonomyFilter && mode !== "browser") {
    return NextResponse.json({ items: [], total: 0 }, { headers: PUBLIC_CACHE_HEADERS });
  }

  const needsFullIndex =
    mode === "browser" ||
    hasTaxonomyFilter ||
    isKnownTaxonomyQuery(q) ||
    sort.startsWith("year-") ||
    sort.startsWith("reference-") ||
    sort.startsWith("genre-");
  let games = needsFullIndex ? await fullSearchGames() : quickSearchGames();
  const filters = {
    q,
    platform,
    region,
    sort,
    priceType,
    priceFilter,
    genre: genreSlug || "all",
    subgenre: subgenreSlug || "all",
    facet: facetSlug || "all",
  };
  let filtered = filterCatalogGames(
    games,
    filters,
    { platforms: true, regions: true },
  );

  if (!needsFullIndex && q.trim() && filtered.total < MAX_RESULTS) {
    games = await fullSearchGames();
    filtered = filterCatalogGames(games, filters, { platforms: true, regions: true });
  }

  if (mode === "browser") {
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    return NextResponse.json(
      {
        items: filtered.items.slice(start, start + CATALOG_PAGE_SIZE).map(toCatalogCardGame),
        total: filtered.total,
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  }

  const rankedItems = q.trim()
    ? [...filtered.items].sort((a, b) => relevanceScore(b, q) - relevanceScore(a, q) || a.title.localeCompare(b.title, "es"))
    : filtered.items;

  const items: SearchResult[] = rankedItems.slice(0, MAX_RESULTS).map((game) => {
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
