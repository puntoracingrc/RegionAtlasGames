import catalogData from "../../data/catalog.json";
import platformsData from "../../data/platforms.json";
import batchesData from "../../data/price-sync-batches.json";
import priceSyncStateData from "../../data/price-sync-state.json";
import {
  listAdminPriceJobs,
  priceWorkerPublicBaseUrl,
  type AdminPriceJobMeta,
} from "./admin-price-collect";
import {
  listAdminPriceCronAttempts,
  type AdminPriceCronAttempt,
} from "./admin-price-cron-log";

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
  syncStateSource: "worker" | "local";
  workerUrls: {
    state: string | null;
    cronLog: string | null;
    attempts: string | null;
  };
  nextStep: {
    slug: string | null;
    label: string;
    scheduledAt: string | null;
    platforms: { slug: string; name: string }[];
  };
  recentSyncs: AdminPriceSyncRow[];
  platformHealth: AdminPlatformPriceHealth[];
  manualJobs: AdminPriceJobMeta[];
  cronAttempts: AdminPriceCronAttempt[];
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

export type AdminPriceSourceUpdate = { label: string; value: number };

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
  sourceUpdates: AdminPriceSourceUpdate[];
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
function platformName(slug: string): string {
  const platform = platforms.find((p) => p.slug === slug);
  return platform?.shortName || platform?.name || slug;
}

function resolveStep(
  step: string | undefined,
): AdminPriceDashboard["nextStep"] {
  if (!step) {
    return {
      slug: null,
      label: "Sin paso programado",
      scheduledAt: null,
      platforms: [],
    };
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
  next.setUTCHours(4, 17, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

function parseRemotePriceSyncState(data: unknown): PriceSyncState | null {
  if (!data || typeof data !== "object") return null;
  const state = data as PriceSyncState;
  if (!state.platforms || typeof state.platforms !== "object") return null;
  return state;
}

async function loadWorkerPriceSyncState(): Promise<PriceSyncState | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/app/data/price-sync-state.json`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return parseRemotePriceSyncState(await response.json());
  } catch {
    return null;
  }
}

function workerUrls() {
  const base = priceWorkerPublicBaseUrl();
  return {
    state: base ? `${base}/app/data/price-sync-state.json` : null,
    cronLog: base ? `${base}/cron/price-rotation.log` : null,
    attempts: base ? `${base}/cron/price-rotation-attempts.json` : null,
  };
}

async function listHostingPriceCronAttempts(
  limit: number,
): Promise<AdminPriceCronAttempt[]> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return [];
  try {
    const response = await fetch(`${base}/cron/price-rotation-attempts.json`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      attempts?: AdminPriceCronAttempt[];
    };
    return (Array.isArray(data.attempts) ? data.attempts : [])
      .filter((attempt): attempt is AdminPriceCronAttempt =>
        Boolean(
          attempt?.id &&
          attempt.at &&
          ["started", "done", "blocked", "skipped", "error"].includes(
            attempt.status,
          ),
        ),
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function hasPrice(game: (typeof catalog)[number]): boolean {
  return Boolean(game.hasEsPrice || game.recommendedPrice != null);
}

function sourceUpdatesFromStats(
  stats: PriceSyncPlatformStats | undefined,
): AdminPriceSourceUpdate[] {
  if (!stats) return [];
  return [
    ["P2P", stats.gamesUpdated],
    ["CeX", stats.cexGamesUpdated],
    ["JGO", stats.jgoGamesUpdated],
    ["Chollo", stats.cholloGamesUpdated],
    ["Kaoto", stats.kaotoGamesUpdated],
    ["TodoConsolas", stats.tcnsGamesUpdated],
    ["TodoColeccion", stats.tcGamesUpdated],
  ]
    .map(([label, value]) => ({
      label: String(label),
      value: Number(value ?? 0),
    }))
    .filter((item) => item.value > 0);
}

function platformHealth(state: PriceSyncState): AdminPlatformPriceHealth[] {
  const listed = catalog.filter((game) => game.listingStatus !== "excluded");
  const next = resolveStep(state.nextPlatformSlug).platforms.map((p) => p.slug);

  return platforms
    .map((platform) => {
      const games = listed.filter(
        (game) => game.platformSlug === platform.slug,
      );
      const regionMap = new Map<string, typeof games>();
      for (const game of games) {
        const region = game.region || "Sin región";
        regionMap.set(region, [...(regionMap.get(region) ?? []), game]);
      }
      const pricedGames = games.filter(hasPrice).length;
      const verifiedGames = games.filter(
        (game) => game.priceRegionVerified === true,
      ).length;
      const sync = state.platforms?.[platform.slug];
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
        sourceUpdates: sourceUpdatesFromStats(sync),
        nextInRotation: next.includes(platform.slug),
        regions: [...regionMap.entries()]
          .map(([region, regionGames]) => {
            const regionPriced = regionGames.filter(hasPrice).length;
            const regionVerified = regionGames.filter(
              (game) => game.priceRegionVerified === true,
            ).length;
            const regionSync = state.regions?.[platform.slug]?.[region];
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
      if (a.nextInRotation !== b.nextInRotation)
        return a.nextInRotation ? -1 : 1;
      return a.coveragePct - b.coveragePct || b.totalGames - a.totalGames;
    });
}

export async function getAdminPriceDashboard(
  limit = 18,
): Promise<AdminPriceDashboard> {
  const workerState = await loadWorkerPriceSyncState();
  const activeState = workerState ?? priceSyncState;
  const recentSyncs = Object.entries(activeState.platforms ?? {})
    .map(([platformSlug, stats]) => ({
      platformSlug,
      platformName: platformName(platformSlug),
      ...stats,
    }))
    .filter((row) => Boolean(row.lastSyncAt))
    .sort(
      (a, b) => Date.parse(b.lastSyncAt ?? "") - Date.parse(a.lastSyncAt ?? ""),
    )
    .slice(0, limit);

  const cronAttempts = [
    ...(await listHostingPriceCronAttempts(12)),
    ...(await listAdminPriceCronAttempts(12)),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12);

  return {
    lastRunAt: activeState.lastRunAt ?? null,
    syncStateSource: workerState ? "worker" : "local",
    workerUrls: workerUrls(),
    nextStep: resolveStep(activeState.nextPlatformSlug),
    recentSyncs,
    platformHealth: platformHealth(activeState),
    manualJobs: await listAdminPriceJobs(limit),
    cronAttempts,
  };
}
