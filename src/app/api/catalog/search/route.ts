import { NextResponse } from "next/server";
import {
  DEFAULT_SORT,
  filterCatalogGames,
  regionOptions,
  type CatalogSort,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { listedCatalog } from "@/lib/catalog";
import { getPlatform } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-seo";
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

  if (q.trim().length < 2 && platform === "all" && region === "all") {
    return NextResponse.json({ items: [], total: 0 });
  }

  const games = listedCatalog.map(toCatalogListGame);
  const filtered = filterCatalogGames(
    games,
    { q, platform, region, sort, priceFilter: "all" },
    { platforms: true, regions: true },
  );

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
      coverUrl: game.coverUrl,
    };
  });

  return NextResponse.json({
    items,
    total: filtered.total,
    regions: regionOptions(games),
  });
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
