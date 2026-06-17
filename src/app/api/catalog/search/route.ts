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

  const items: SearchResult[] = filtered.items.slice(0, MAX_RESULTS).map((game) => {
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
