import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import catalogData from "../../data/catalog.json";
import platformsData from "../../data/platforms.json";
import batchesData from "../../data/price-sync-batches.json";
import priceSyncStateData from "../../data/price-sync-state.json";
import type { AdminPriceJobMeta } from "./admin-price-collect";

type PlatformInfo = {
  slug: string;
  name: string;
  shortName?: string;
};

type PriceSyncPlatformStats = {
  lastSyncAt?: string;
  source?: string;
  gamesTargeted?: number;
  gamesUpdated?: number;
  gamesSkippedNoData?: number;
  gamesRejectedOutliers?: number;
  gamesRejectedUnverifiedRegion?: number;
  cexGamesUpdated?: number;
  jgoGamesUpdated?: number;
  cholloGamesUpdated?: number;
  kaotoGamesUpdated?: number;
  tcnsGamesUpdated?: number;
  tcGamesUpdated?: number;
  coveragePct?: number;
};

type PriceSyncState = {
  rotationOrder?: string[];
  lastRunAt?: string;
  nextPlatformSlug?: string;
  platforms?: Record<string, PriceSyncPlatformStats>;
  regions?: Record<string, Record<string, PriceSyncPlatformStats>>;
};

type BatchConfig = {
  batches?: Record<string, { label?: string; platforms?: string[] }>;
};

export type AdminPriceSyncRow = PriceSyncPlatformStats & {
  platformSlug: string;
  platformName: string;
};

export type AdminPriceDashboard = {
  lastRunAt: string | null;
  nextStep: {
    slug: string | null;
    label: string;
    scheduledAt: string | null;
    platforms: { slug: string; name: string }[];
  };
  recentSyncs: AdminPriceSyncRow[];
  platformHealth: AdminPlatformPriceHealth[];
  manualJobs: AdminPriceJobMeta[];
};

export type AdminRegionPriceHealth = {
  region: string;
  totalGames: number;
  pricedGames: number;
  verifiedGames: number;
  coveragePct: number;
  verifiedCoveragePct: number;
  lastSyncAt: string | null;
  source: string | null;
};

export type AdminPlatformPriceHealth = {
  platformSlug: string;
  platformName: string;
  totalGames: number;
  pricedGames: number;
  verifiedGames: number;
  coveragePct: number;
  verifiedCoveragePct: number;
  lastSyncAt: string | null;
  source: string | null;
  gamesUpdated: number | null;
  nextInRotation: boolean;
  regions: AdminRegionPriceHealth[];
};

const platforms = platformsData as PlatformInfo[];
const batches = batchesData as BatchConfig;
const priceSyncState = priceSyncStateData as PriceSyncState;
const catalog = catalogData as {
  platformSlug?: string;
  region?: string;
  listingStatus?: string;
  hasEsPrice?: boolean;
  recommendedPrice?: number | null;
  priceRegionVerified?: boolean;
}[];
const JOBS_DIR = path.join(process.cwd(), "data", "admin", "price-jobs");

function platformName(slug: string): string {
  const platform = platforms.find((p) => p.slug === slug);
  return platform?.shortName || platform?.name || slug;
}

function resolveStep(step: string | undefined): AdminPriceDashboard["nextStep"] {
  if (!step) {
    return { slug: null, label: "Sin paso programado", scheduledAt: null, platforms: [] };
  }
  const batch = batches.batches?.[step];
  if (batch) {
    const slugs = batch.platforms ?? [];
    return {
      slug: step,
      label: batch.label || step,
      scheduledAt: nextDailyPriceRunAt(),
      platforms: slugs.map((slug) => ({ slug, name: platformName(slug) })),
    };
  }
  return {
    slug: step,
    label: platformName(step),
    scheduledAt: nextDailyPriceRunAt(),
    platforms: [{ slug: step, name: platformName(step) }],
  };
}

function nextDailyPriceRunAt(now = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(4, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

function readManualJobs(limit: number): AdminPriceJobMeta[] {
  if (!existsSync(JOBS_DIR)) return [];
  return readdirSync(JOBS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(readFileSync(path.join(JOBS_DIR, file), "utf8")) as AdminPriceJobMeta;
      } catch {
        return null;
      }
    })
    .filter((job): job is AdminPriceJobMeta => Boolean(job))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function hasPrice(game: (typeof catalog)[number]): boolean {
  return Boolean(game.hasEsPrice || game.recommendedPrice != null);
}

function platformHealth(): AdminPlatformPriceHealth[] {
  const listed = catalog.filter((game) => game.listingStatus !== "excluded");
  const next = resolveStep(priceSyncState.nextPlatformSlug).platforms.map((p) => p.slug);

  return platforms
    .map((platform) => {
      const games = listed.filter((game) => game.platformSlug === platform.slug);
      const regionMap = new Map<string, typeof games>();
      for (const game of games) {
        const region = game.region || "Sin región";
        regionMap.set(region, [...(regionMap.get(region) ?? []), game]);
      }
      const pricedGames = games.filter(hasPrice).length;
      const verifiedGames = games.filter((game) => game.priceRegionVerified === true).length;
      const sync = priceSyncState.platforms?.[platform.slug];
      return {
        platformSlug: platform.slug,
        platformName: platform.shortName || platform.name || platform.slug,
        totalGames: games.length,
        pricedGames,
        verifiedGames,
        coveragePct: pct(pricedGames, games.length),
        verifiedCoveragePct: pct(verifiedGames, games.length),
        lastSyncAt: sync?.lastSyncAt ?? null,
        source: sync?.source ?? null,
        gamesUpdated: sync?.gamesUpdated ?? null,
        nextInRotation: next.includes(platform.slug),
        regions: [...regionMap.entries()]
          .map(([region, regionGames]) => {
            const regionPriced = regionGames.filter(hasPrice).length;
            const regionVerified = regionGames.filter((game) => game.priceRegionVerified === true).length;
            const regionSync = priceSyncState.regions?.[platform.slug]?.[region];
            return {
              region,
              totalGames: regionGames.length,
              pricedGames: regionPriced,
              verifiedGames: regionVerified,
              coveragePct: pct(regionPriced, regionGames.length),
              verifiedCoveragePct: pct(regionVerified, regionGames.length),
              lastSyncAt: regionSync?.lastSyncAt ?? null,
              source: regionSync?.source ?? null,
            };
          })
          .sort((a, b) => b.totalGames - a.totalGames),
      };
    })
    .filter((row) => row.totalGames > 0)
    .sort((a, b) => {
      if (a.nextInRotation !== b.nextInRotation) return a.nextInRotation ? -1 : 1;
      return a.coveragePct - b.coveragePct || b.totalGames - a.totalGames;
    });
}

export function getAdminPriceDashboard(limit = 18): AdminPriceDashboard {
  const recentSyncs = Object.entries(priceSyncState.platforms ?? {})
    .map(([platformSlug, stats]) => ({
      platformSlug,
      platformName: platformName(platformSlug),
      ...stats,
    }))
    .filter((row) => Boolean(row.lastSyncAt))
    .sort((a, b) => Date.parse(b.lastSyncAt ?? "") - Date.parse(a.lastSyncAt ?? ""))
    .slice(0, limit);

  return {
    lastRunAt: priceSyncState.lastRunAt ?? null,
    nextStep: resolveStep(priceSyncState.nextPlatformSlug),
    recentSyncs,
    platformHealth: platformHealth(),
    manualJobs: readManualJobs(limit),
  };
}
