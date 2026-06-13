import { getRegionDisplay } from "@/lib/region-display";
import type { CatalogGame } from "@/lib/types";

export type RegionSlice = {
  label: string;
  shortLabel: string;
  count: number;
  pct: number;
  barColorClass: string;
};

export type PlatformCatalogInsights = {
  total: number;
  withEsPrice: number;
  withCover: number;
  pricePct: number;
  coverPct: number;
  /** Todas las regiones presentes, orden fijas: ES → EU → US → JP → resto */
  topRegions: RegionSlice[];
};

const REGION_BAR_COLORS = [
  "bg-amber-500/80",
  "bg-sky-500/70",
  "bg-violet-500/70",
  "bg-emerald-500/70",
  "bg-rose-500/60",
  "bg-orange-500/60",
  "bg-cyan-500/60",
];

/** Orden en barra: española → europea → US → Japón → resto (por cantidad). */
export function regionSortRank(label: string): number {
  const key = label.trim().toLowerCase();
  if (key === "pal españa" || key === "españa") return 0;
  if (key === "pal europa") return 1;
  if (key === "usa") return 2;
  if (key === "japón" || key === "japan") return 3;
  return 4;
}

export function sortRegionSlices(entries: [string, number][], total: number): RegionSlice[] {
  const sorted = entries.sort((a, b) => {
    const rankDiff = regionSortRank(a[0]) - regionSortRank(b[0]);
    if (rankDiff !== 0) return rankDiff;
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "es");
  });

  let restIndex = 0;
  return sorted.map(([label, count]) => {
    const rank = regionSortRank(label);
    const barColorClass =
      rank < 4
        ? REGION_BAR_COLORS[rank]
        : REGION_BAR_COLORS[4 + (restIndex++ % (REGION_BAR_COLORS.length - 4))];
    const { shortLabel } = getRegionDisplay(label);
    return {
      label,
      shortLabel,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      barColorClass,
    };
  });
}

export function regionBarColor(index: number): string {
  return REGION_BAR_COLORS[index % REGION_BAR_COLORS.length];
}

/** Color estable por tipo de región (ES/EU/US/JP); resto por índice en la barra. */
export function regionBarColorForLabel(label: string, restIndex = 0): string {
  const rank = regionSortRank(label);
  if (rank < 4) return REGION_BAR_COLORS[rank];
  return REGION_BAR_COLORS[4 + (restIndex % (REGION_BAR_COLORS.length - 4))];
}

export function buildPlatformCatalogInsights(games: CatalogGame[]): PlatformCatalogInsights {
  const total = games.length;
  const withEsPrice = games.filter((g) => g.hasEsPrice).length;
  const withCover = games.filter((g) => Boolean(g.coverUrl)).length;

  const regionCounts = new Map<string, number>();
  for (const game of games) {
    regionCounts.set(game.region, (regionCounts.get(game.region) ?? 0) + 1);
  }

  const topRegions = sortRegionSlices([...regionCounts.entries()], total);

  return {
    total,
    withEsPrice,
    withCover,
    pricePct: total > 0 ? Math.round((withEsPrice / total) * 1000) / 10 : 0,
    coverPct: total > 0 ? Math.round((withCover / total) * 1000) / 10 : 0,
    topRegions,
  };
}
