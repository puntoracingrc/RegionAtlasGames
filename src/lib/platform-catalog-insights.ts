import { getRegionDisplay } from "@/lib/region-display";
import { publicRegionLabelForPlatform } from "@/lib/platform-region-policy";

export type RegionSlice = {
  label: string;
  shortLabel: string;
  count: number;
  pct: number;
  barColorClass: string;
  flagRegion?: string;
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

const FALLBACK_REGION_BAR_COLORS = ["bg-rose-500/60", "bg-orange-500/60", "bg-cyan-500/60"];

const REGION_BAR_COLOR_BY_RANK: Record<number, string> = {
  0: "bg-amber-500/80",
  1: "bg-sky-500/70",
  2: "bg-violet-500/70",
  3: "bg-emerald-500/70",
};

/** Orden en barra: PAL ES → PAL EU → NTSC US → NTSC-J → resto (por cantidad). */
export function regionSortRank(label: string): number {
  const key = label.trim().toLowerCase();
  if (key === "pal españa" || key === "españa") return 0;
  if (key === "pal europa" || key === "europea") return 1;
  if (key === "usa" || key === "ntsc usa") return 2;
  if (key === "occidental") return 2;
  if (key === "internacional") return 2;
  if (key === "japón" || key === "japan" || key === "ntsc-j japón") return 3;
  if (key === "japonesa") return 3;
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
        ? regionBarColorForLabel(label)
        : regionBarColorForLabel(label, restIndex++);
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
  const stableColors = [
    REGION_BAR_COLOR_BY_RANK[0],
    REGION_BAR_COLOR_BY_RANK[1],
    REGION_BAR_COLOR_BY_RANK[2],
    REGION_BAR_COLOR_BY_RANK[3],
    ...FALLBACK_REGION_BAR_COLORS,
  ];
  return stableColors[index % stableColors.length];
}

/** Color estable por tipo de región (ES/EU/US/JP); resto por índice en la barra. */
export function regionBarColorForLabel(label: string, restIndex = 0): string {
  const rank = regionSortRank(label);
  if (rank < 4) return REGION_BAR_COLOR_BY_RANK[rank];
  return FALLBACK_REGION_BAR_COLORS[restIndex % FALLBACK_REGION_BAR_COLORS.length];
}

type PlatformInsightGame = {
  hasEsPrice?: boolean;
  coverUrl?: string | null;
  region: string;
};

export function buildPlatformCatalogInsights(
  games: PlatformInsightGame[],
  platformSlug?: string,
): PlatformCatalogInsights {
  const total = games.length;
  const withEsPrice = games.filter((g) => g.hasEsPrice).length;
  const withCover = games.filter((g) => Boolean(g.coverUrl)).length;

  const regionCounts = new Map<string, number>();
  const flagRegions = new Map<string, string>();
  for (const game of games) {
    const canonicalLabel = getRegionDisplay(game.region).label;
    const label = platformSlug
      ? publicRegionLabelForPlatform(platformSlug, game.region)
      : canonicalLabel;
    regionCounts.set(label, (regionCounts.get(label) ?? 0) + 1);
    if (label !== canonicalLabel) flagRegions.set(label, canonicalLabel);
  }

  const topRegions = sortRegionSlices([...regionCounts.entries()], total).map((region) => ({
    ...region,
    ...(flagRegions.get(region.label) ? { flagRegion: flagRegions.get(region.label) } : {}),
  }));

  return {
    total,
    withEsPrice,
    withCover,
    pricePct: total > 0 ? Math.round((withEsPrice / total) * 1000) / 10 : 0,
    coverPct: total > 0 ? Math.round((withCover / total) * 1000) / 10 : 0,
    topRegions,
  };
}
