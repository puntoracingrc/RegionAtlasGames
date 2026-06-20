import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  facetFilterOptions,
  filterCatalogGames,
  genreFilterOptions,
  regionOptions,
  subgenreFilterOptions,
  type CatalogPriceFilter,
  type CatalogSort,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { listedCatalog } from "@/lib/catalog";
import { getPlatform } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-seo";
import { getCoverSrc } from "@/lib/cover-url";
import type { CatalogListGame } from "@/lib/types";

const MAX_RESULTS = 12;

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const platform = url.searchParams.get("platform") ?? "all";
  const region = url.searchParams.get("region") ?? "all";
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceFilter = (url.searchParams.get("priceFilter") ?? "all") as CatalogPriceFilter;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const mode = url.searchParams.get("mode") ?? "quick";
  const genreSlug = url.searchParams.get("genre") ?? "";
  const subgenreSlug = url.searchParams.get("subgenre") ?? "";
  const facetSlug = url.searchParams.get("facet") ?? "";
  const hasTaxonomyFilter = Boolean(genreSlug || subgenreSlug || facetSlug);

  if (q.trim().length < 2 && platform === "all" && region === "all" && !hasTaxonomyFilter && mode !== "browser") {
    return NextResponse.json({ items: [], total: 0 });
  }

  const games = listedCatalog.map(toCatalogListGame);
  const filters = {
    q,
    platform,
    region,
    sort,
    priceFilter,
    genre: genreSlug || "all",
    subgenre: subgenreSlug || "all",
    facet: facetSlug || "all",
  };
  const filtered = filterCatalogGames(
    games,
    filters,
    { platforms: true, regions: true },
  );

  if (mode === "browser") {
    const taxonomyOptions = buildTaxonomyOptions(games, filters);
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    return NextResponse.json({
      items: filtered.items.slice(start, start + CATALOG_PAGE_SIZE),
      total: filtered.total,
      regions: regionOptions(games),
      taxonomyOptions,
    });
  }

  const rankedItems = q.trim()
    ? [...filtered.items].sort((a, b) => relevanceScore(b, q) - relevanceScore(a, q) || a.title.localeCompare(b.title, "es"))
    : filtered.items;

  const items: SearchResult[] = rankedItems.slice(0, MAX_RESULTS).map((game) => {
    const platformData = getPlatform(game.platformSlug);
    return {
      id: game.id,
      title: game.title,
      href: catalogGamePath(game),
      platform: platformData?.shortName ?? game.displayPlatform,
      platformSlug: game.platformSlug,
      region: game.region,
      year: game.displayYear,
      price: game.recommendedPrice,
      coverUrl: getCoverSrc(game.coverUrl, game.id),
    };
  });

  return NextResponse.json({
    items,
    total: filtered.total,
  });
}

function buildTaxonomyOptions(
  games: CatalogListGame[],
  filters: {
    q: string;
    platform: string;
    region: string;
    sort: CatalogSort;
    priceFilter: CatalogPriceFilter;
    genre: string;
    subgenre: string;
    facet: string;
  },
) {
  return {
    genres: genreFilterOptions(
      filterCatalogGames(games, { ...filters, genre: "all" }, { platforms: true, regions: true }).items,
    ),
    subgenres: subgenreFilterOptions(
      filterCatalogGames(games, { ...filters, subgenre: "all" }, { platforms: true, regions: true }).items,
    ),
    facets: facetFilterOptions(
      filterCatalogGames(games, { ...filters, facet: "all" }, { platforms: true, regions: true }).items,
    ),
  };
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
