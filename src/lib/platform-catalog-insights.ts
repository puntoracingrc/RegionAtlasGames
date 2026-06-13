import { getRegionDisplay } from "@/lib/region-display";
import type { CatalogGame } from "@/lib/types";

export type RegionSlice = {
  label: string;
  shortLabel: string;
  count: number;
  pct: number;
};

export type PlatformCatalogInsights = {
  total: number;
  withEsPrice: number;
  withCover: number;
  pricePct: number;
  coverPct: number;
  topRegions: RegionSlice[];
};

const REGION_BAR_COLORS = [
  "bg-amber-500/80",
  "bg-sky-500/70",
  "bg-violet-500/70",
  "bg-emerald-500/70",
  "bg-rose-500/60",
];

export function regionBarColor(index: number): string {
  return REGION_BAR_COLORS[index % REGION_BAR_COLORS.length];
}

export function buildPlatformCatalogInsights(games: CatalogGame[]): PlatformCatalogInsights {
  const total = games.length;
  const withEsPrice = games.filter((g) => g.hasEsPrice).length;
  const withCover = games.filter((g) => Boolean(g.coverUrl)).length;

  const regionCounts = new Map<string, number>();
  for (const game of games) {
    regionCounts.set(game.region, (regionCounts.get(game.region) ?? 0) + 1);
  }

  const topRegions = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => {
      const { shortLabel } = getRegionDisplay(label);
      return {
        label,
        shortLabel,
        count,
        pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });

  return {
    total,
    withEsPrice,
    withCover,
    pricePct: total > 0 ? Math.round((withEsPrice / total) * 1000) / 10 : 0,
    coverPct: total > 0 ? Math.round((withCover / total) * 1000) / 10 : 0,
    topRegions,
  };
}
