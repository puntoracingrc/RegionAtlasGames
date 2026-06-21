import catalogData from "../../data/catalog.json";
import platformsData from "../../data/platforms.json";
import batchesData from "../../data/price-sync-batches.json";
import priceSyncStateData from "../../data/price-sync-state.json";
import path from "path";
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

async function loadHostingPriceCronLogTail(): Promise<string | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/cron/price-rotation.log`, {
      cache: "no-store",
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

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (
    process.env.COVERS_FTP_REMOTE_ROOT?.trim() ||
    "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers"
  ).replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function workerSftpConfig(): { host: string; port: number; username: string; password: string } | null {
  const host = process.env.PRICE_WORKER_SSH_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim();
  const username = process.env.PRICE_WORKER_SSH_USER?.trim() || process.env.COVERS_FTP_USER?.trim();
  const password = process.env.PRICE_WORKER_SSH_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SSH_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  return { host, port, username, password };
}

function envHasOpenAiKey(text: string): boolean {
  return /^\s*OPENAI_API_KEY\s*=\s*\S+/m.test(text);
}

async function loadWorkerOpenAiConfigured(): Promise<{ configured: boolean | null; checkedAt: string | null }> {
  const config = workerSftpConfig();
  if (!config) return { configured: null, checkedAt: null };

  const remoteRoot = priceWorkerRemoteRoot();
  const candidates = [
    path.posix.join(remoteRoot, "app", ".env.local"),
    path.posix.join(remoteRoot, "app", ".env"),
    path.posix.join(remoteRoot, ".env"),
    path.posix.join(remoteRoot, "cron", "price_rotation.sh"),
    ".region-atlas-cron/price_rotation.sh",
  ];
  let client:
    | {
        connect(config: Record<string, unknown>): Promise<void>;
        exists(remotePath: string): Promise<boolean | "d" | "-" | "l">;
        get(remotePath: string): Promise<Buffer | string>;
        end(): Promise<void>;
      }
    | null = null;

  try {
    const mod = (await import("ssh2-sftp-client")) as unknown as {
      default: new () => NonNullable<typeof client>;
    };
    client = new mod.default();
    await client.connect({ ...config, readyTimeout: 20_000, retries: 1 });
    for (const candidate of candidates) {
      const exists = await client.exists(candidate).catch(() => false);
      if (!exists) continue;
      const payload = await client.get(candidate);
      const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload);
      if (envHasOpenAiKey(text)) {
        return { configured: true, checkedAt: new Date().toISOString() };
      }
    }
    return { configured: false, checkedAt: new Date().toISOString() };
  } catch {
    return { configured: null, checkedAt: new Date().toISOString() };
  } finally {
    await client?.end().catch(() => undefined);
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
        "El hosting externo tiene OPENAI_API_KEY cargada. El detalle por fuente aparecerá tras cada sync.",
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
        "No se ha encontrado OPENAI_API_KEY en el worker externo; los collectors deben resolver sin IA.",
      sourceUsage,
      conditionVision: summary?.conditionVision ?? {},
    };
  }
  return {
    workerOpenAiConfigured: null,
    checkedAt: workerOpenAi.checkedAt,
    label: summary?.openAiConfigured ? "IA activa en sync" : "IA no comprobada",
    helper:
      "No se pudo confirmar la variable del worker por SFTP. Se muestra el último resumen guardado si existe.",
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
  const [workerState, workerOpenAi] = await Promise.all([
    loadWorkerPriceSyncState(),
    loadWorkerOpenAiConfigured(),
  ]);
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
    cronLogTail: await loadHostingPriceCronLogTail(),
    nextStep: resolveStep(activeState.nextPlatformSlug),
    recentSyncs,
    platformHealth: platformHealth(activeState),
    manualJobs: await listAdminPriceJobs(limit),
    cronAttempts,
    ebayStatus: buildEbayStatus(),
    aiStatus: buildAiStatus(workerOpenAi, latestAiSummary(activeState)),
  };
}
