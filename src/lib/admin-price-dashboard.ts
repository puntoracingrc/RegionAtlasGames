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
  wallapopGamesUpdated?: number;
  ebayGamesUpdated?: number;
  vintedGamesUpdated?: number;
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
  priceListTotalGames?: number;
  priceListPricedBefore?: number;
  priceListPricedAfter?: number;
  priceListPricedDelta?: number;
  priceListCoverageBeforePct?: number;
  priceListCoverageAfterPct?: number;
  priceListCoverageDeltaPct?: number;
  aiSummary?: AdminPriceAiSummary;
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
    todoConsolasWeeklyStatus: string | null;
    todoConsolasWeeklyLog: string | null;
  };
  cronLogTail: string | null;
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
  ebayStatus: AdminPriceEbayStatus;
  aiStatus: AdminPriceAiStatus;
  todoConsolasWeekly: AdminTodoConsolasWeeklyStatus;
};

export type AdminTodoConsolasWeeklyStatus = {
  available: boolean;
  enabled: boolean | null;
  status: string;
  campaignId: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  nextDueAt: string | null;
  blockedUntil: string | null;
  lastAction: string | null;
  error: string | null;
  progress: {
    unitsCompleted: number;
    unitsTotal: number;
    pagesProcessed: number;
    knownPagesTotal: number;
    exactListings: number;
    reviewListings: number;
  };
};

export type AdminPriceEbayStatus = {
  collectionReady: boolean;
  affiliateReady: boolean;
  label: string;
  helper: string;
  warnings: string[];
};

export type AdminPriceAiSourceUsage = {
  source: string;
  aiRows?: number;
  resolved?: number;
  review?: number;
  rejected?: number;
};

export type AdminPriceAiSummary = {
  openAiConfigured?: boolean;
  sources?: AdminPriceAiSourceUsage[];
  conditionVision?: Record<string, number>;
};

export type AdminPriceAiStatus = {
  workerOpenAiConfigured: boolean | null;
  checkedAt: string | null;
  label: string;
  helper: string;
  sourceUsage: AdminPriceAiSourceUsage[];
  conditionVision: Record<string, number>;
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
      signal: AbortSignal.timeout(3_000),
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
    todoConsolasWeeklyStatus: base ? `${base}/cron/todoconsolas-weekly-status.json` : null,
    todoConsolasWeeklyLog: base ? `${base}/cron/todoconsolas-weekly.log` : null,
  };
}

function emptyTodoConsolasWeeklyStatus(): AdminTodoConsolasWeeklyStatus {
  return {
    available: false,
    enabled: null,
    status: "not_reported",
    campaignId: null,
    updatedAt: null,
    completedAt: null,
    nextDueAt: null,
    blockedUntil: null,
    lastAction: null,
    error: null,
    progress: {
      unitsCompleted: 0,
      unitsTotal: 0,
      pagesProcessed: 0,
      knownPagesTotal: 0,
      exactListings: 0,
      reviewListings: 0,
    },
  };
}

async function loadTodoConsolasWeeklyStatus(): Promise<AdminTodoConsolasWeeklyStatus> {
  const url = workerUrls().todoConsolasWeeklyStatus;
  if (!url) return emptyTodoConsolasWeeklyStatus();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return emptyTodoConsolasWeeklyStatus();
    const data = (await response.json()) as Record<string, unknown>;
    const rawProgress = data.progress && typeof data.progress === "object"
      ? data.progress as Record<string, unknown>
      : {};
    const lastError = data.lastError && typeof data.lastError === "object"
      ? data.lastError as Record<string, unknown>
      : {};
    const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
    return {
      available: true,
      enabled: typeof data.enabled === "boolean" ? data.enabled : null,
      status: String(data.status || "unknown"),
      campaignId: data.campaignId ? String(data.campaignId) : null,
      updatedAt: data.updatedAt ? String(data.updatedAt) : null,
      completedAt: data.completedAt ? String(data.completedAt) : null,
      nextDueAt: data.nextDueAt ? String(data.nextDueAt) : null,
      blockedUntil: data.blockedUntil ? String(data.blockedUntil) : null,
      lastAction: data.lastAction ? String(data.lastAction) : null,
      error: lastError.message ? String(lastError.message) : null,
      progress: {
        unitsCompleted: numberValue(rawProgress.unitsCompleted),
        unitsTotal: numberValue(rawProgress.unitsTotal),
        pagesProcessed: numberValue(rawProgress.pagesProcessed),
        knownPagesTotal: numberValue(rawProgress.knownPagesTotal),
        exactListings: numberValue(rawProgress.exactListings),
        reviewListings: numberValue(rawProgress.reviewListings),
      },
    };
  } catch {
    return emptyTodoConsolasWeeklyStatus();
  }
}

async function listHostingPriceCronAttempts(
  limit: number,
): Promise<AdminPriceCronAttempt[]> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return [];
  try {
    const response = await fetch(`${base}/cron/price-rotation-attempts.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
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

async function loadHostingPriceCronLogTail(): Promise<string | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/cron/price-rotation.log`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    return lines.slice(-80).join("\n") || null;
  } catch {
    return null;
  }
}

function latestAiSummary(state: PriceSyncState): AdminPriceAiSummary | null {
  return (
    Object.values(state.platforms ?? {})
      .filter((stats) => Boolean(stats.aiSummary))
      .sort(
        (a, b) =>
          Date.parse(b.lastSyncAt ?? "") - Date.parse(a.lastSyncAt ?? ""),
      )[0]?.aiSummary ?? null
  );
}

function workerOpenAiTelemetry(state: PriceSyncState): {
  configured: boolean | null;
  checkedAt: string | null;
} {
  const latest = Object.values(state.platforms ?? {})
    .filter((stats) => Boolean(stats.aiSummary))
    .sort((a, b) => Date.parse(b.lastSyncAt ?? "") - Date.parse(a.lastSyncAt ?? ""))[0];
  return {
    configured: typeof latest?.aiSummary?.openAiConfigured === "boolean"
      ? latest.aiSummary.openAiConfigured
      : null,
    checkedAt: latest?.lastSyncAt ?? null,
  };
}

function buildAiStatus(
  workerOpenAi: { configured: boolean | null; checkedAt: string | null },
  summary: AdminPriceAiSummary | null,
): AdminPriceAiStatus {
  const sourceUsage = (summary?.sources ?? []).filter((source) =>
    Boolean(source.source),
  );
  if (workerOpenAi.configured === true) {
    return {
      workerOpenAiConfigured: true,
      checkedAt: workerOpenAi.checkedAt,
      label: "IA activa en worker",
      helper:
        "La última telemetría de sincronización confirma IA activa. El panel no abre una conexión SFTP para comprobar secretos.",
      sourceUsage,
      conditionVision: summary?.conditionVision ?? {},
    };
  }
  if (workerOpenAi.configured === false) {
    return {
      workerOpenAiConfigured: false,
      checkedAt: workerOpenAi.checkedAt,
      label: "IA apagada en worker",
      helper:
        "La última telemetría indicó IA apagada; los recolectores resolvieron sin ella.",
      sourceUsage,
      conditionVision: summary?.conditionVision ?? {},
    };
  }
  return {
    workerOpenAiConfigured: null,
    checkedAt: workerOpenAi.checkedAt,
    label: summary?.openAiConfigured ? "IA activa en sync" : "IA no comprobada",
    helper:
      "La última sincronización no dejó telemetría suficiente. No se consultan secretos del worker al abrir el panel.",
    sourceUsage,
    conditionVision: summary?.conditionVision ?? {},
  };
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
    ["P2P total", stats.gamesUpdated],
    ["Wallapop", stats.wallapopGamesUpdated],
    ["eBay", stats.ebayGamesUpdated],
    ["Vinted", stats.vintedGamesUpdated],
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

function boolEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function buildEbayStatus(): AdminPriceEbayStatus {
  const hasAppId = Boolean(process.env.EBAY_APP_ID?.trim());
  const hasClientId = Boolean(process.env.EBAY_CLIENT_ID?.trim());
  const hasClientSecret = Boolean(process.env.EBAY_CLIENT_SECRET?.trim());
  const hasManualToken = Boolean(
    process.env.EBAY_ACCESS_TOKEN?.trim() ||
      process.env.EBAY_OAUTH_TOKEN?.trim(),
  );
  const affiliateEnabled =
    boolEnv("AFFILIATE_OFFERS_ENABLED") || boolEnv("EBAY_AFFILIATE_ENABLED");
  const hasCampaign = Boolean(
    process.env.EBAY_CAMPAIGN_ID?.trim() ||
      process.env.EBAY_AFFILIATE_CAMPAIGN_ID?.trim(),
  );
  const renewableBrowse = hasClientId && hasClientSecret;
  const collectionReady = renewableBrowse || hasManualToken || hasAppId;
  const affiliateReady = affiliateEnabled && renewableBrowse && hasCampaign;
  const warnings: string[] = [];

  if (!renewableBrowse) {
    warnings.push(
      "Falta EBAY_CLIENT_SECRET: no se puede renovar token Browse automáticamente.",
    );
  }
  if (hasManualToken && !renewableBrowse) {
    warnings.push("Hay token manual, pero puede caducar o ser inválido.");
  }
  if (!affiliateEnabled) warnings.push("Afiliación eBay desactivada en la web.");
  if (!hasCampaign) warnings.push("Falta campaña de afiliación eBay.");

  return {
    collectionReady,
    affiliateReady,
    label: renewableBrowse
      ? "eBay API renovable"
      : hasManualToken
        ? "eBay con token manual"
        : hasAppId
          ? "eBay legacy limitado"
          : "eBay no configurado",
    helper: affiliateReady
      ? "Listo para API directa, enlaces afiliados y precios eBay válidos fuera de la rueda."
      : collectionReady
        ? "La API puede responder, pero falta completar afiliación o renovación estable."
        : "Sin API directa eBay hasta configurar credenciales.",
    warnings,
  };
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
  const [workerState, hostingAttempts, localAttempts, cronLogTail, manualJobs, todoConsolasWeekly] = await Promise.all([
    loadWorkerPriceSyncState(),
    listHostingPriceCronAttempts(12),
    listAdminPriceCronAttempts(12),
    loadHostingPriceCronLogTail(),
    listAdminPriceJobs(limit),
    loadTodoConsolasWeeklyStatus(),
  ]);
  const activeState = workerState ?? priceSyncState;
  const workerOpenAi = workerOpenAiTelemetry(activeState);
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
    ...hostingAttempts,
    ...localAttempts,
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12);

  return {
    lastRunAt: activeState.lastRunAt ?? null,
    syncStateSource: workerState ? "worker" : "local",
    workerUrls: workerUrls(),
    cronLogTail,
    nextStep: resolveStep(activeState.nextPlatformSlug),
    recentSyncs,
    platformHealth: platformHealth(activeState),
    manualJobs,
    cronAttempts,
    ebayStatus: buildEbayStatus(),
    aiStatus: buildAiStatus(workerOpenAi, latestAiSummary(activeState)),
    todoConsolasWeekly,
  };
}

export async function getAdminPriceRotationTarget(): Promise<AdminPriceDashboard["nextStep"]> {
  const workerState = await loadWorkerPriceSyncState();
  const activeState = workerState ?? priceSyncState;
  return resolveStep(activeState.nextPlatformSlug);
}
