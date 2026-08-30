import path from "path";
import {
  getPcWorkerUpdateOverview,
  resolvePcWorkerDeploymentSha,
  resolveWorkerSftpConfig,
} from "./price-worker-update";

export const WALLAPOP_CAMPAIGN_CONTROL_MODE = "wallapop_pal_control_v1";
export const WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE = 20;
export const WALLAPOP_CAMPAIGN_PAUSE_MINUTES = 10;
export const WALLAPOP_CAMPAIGN_PLATFORMS = ["ps4", "ps5", "ps3", "ps2", "ps1"] as const;

export type WallapopCampaignAction = "enable" | "disable" | "restart";

type WallapopBatchSummary = {
  jobId: string | null;
  platformSlug: string | null;
  catalogIds: string[];
  titles: string[];
  queuedAt: string | null;
  finishedAt: string | null;
  verifiedCatalogIds: string[];
  reviewQueueItems: number;
  error: string | null;
};

export type WallapopCampaignStatus = {
  available: boolean;
  enabled: boolean;
  status: string;
  campaignId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  nextRunAt: string | null;
  lastAction: string | null;
  settings: {
    platforms: string[];
    targetRegion: string;
    batchSize: number;
    maxBatchSize: number;
    pauseMinutes: number;
    jitterMinutes: number;
    autoPublish: boolean;
  };
  progress: {
    processedGames: number;
    totalGames: number;
    completedPlatforms: number;
    totalPlatforms: number;
    byPlatform: Record<string, { processed: number; total: number }>;
  };
  activeBatch: WallapopBatchSummary | null;
  lastBatch: WallapopBatchSummary | null;
  readyArtifactCount: number;
  error: string | null;
  consecutiveErrors: number;
};

export type WallapopCampaignControlStatus = {
  available: boolean;
  ok: boolean | null;
  status: string;
  requestId: string | null;
  action: WallapopCampaignAction | null;
  requestedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type WallapopCampaignOverview = {
  campaign: WallapopCampaignStatus;
  control: WallapopCampaignControlStatus;
  canEnable: boolean;
  canDisable: boolean;
  controlBlockReason: string | null;
};

type UnknownRecord = Record<string, unknown>;

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function cleanNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanStringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, limit);
}

function emptyBatch(): WallapopBatchSummary | null {
  return null;
}

function normalizeBatch(value: unknown): WallapopBatchSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyBatch();
  const row = value as UnknownRecord;
  return {
    jobId: cleanText(row.jobId, 160),
    platformSlug: cleanText(row.platformSlug, 40),
    catalogIds: cleanStringArray(row.catalogIds),
    titles: cleanStringArray(row.titles),
    queuedAt: cleanText(row.queuedAt, 80),
    finishedAt: cleanText(row.finishedAt, 80),
    verifiedCatalogIds: cleanStringArray(row.verifiedCatalogIds, 100),
    reviewQueueItems: Math.max(0, cleanNumber(row.reviewQueueItems)),
    error: cleanText(row.error),
  };
}

export function emptyWallapopCampaignStatus(): WallapopCampaignStatus {
  return {
    available: false,
    enabled: false,
    status: "disabled",
    campaignId: null,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    nextRunAt: null,
    lastAction: null,
    settings: {
      platforms: [...WALLAPOP_CAMPAIGN_PLATFORMS],
      targetRegion: "PAL España",
      batchSize: WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE,
      maxBatchSize: WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE,
      pauseMinutes: WALLAPOP_CAMPAIGN_PAUSE_MINUTES,
      jitterMinutes: 3,
      autoPublish: true,
    },
    progress: {
      processedGames: 0,
      totalGames: 0,
      completedPlatforms: 0,
      totalPlatforms: WALLAPOP_CAMPAIGN_PLATFORMS.length,
      byPlatform: {},
    },
    activeBatch: null,
    lastBatch: null,
    readyArtifactCount: 0,
    error: null,
    consecutiveErrors: 0,
  };
}

export function normalizeWallapopCampaignStatus(value: UnknownRecord | null): WallapopCampaignStatus {
  if (!value) return emptyWallapopCampaignStatus();
  const settings = value.settings && typeof value.settings === "object"
    ? value.settings as UnknownRecord
    : {};
  const progress = value.progress && typeof value.progress === "object"
    ? value.progress as UnknownRecord
    : {};
  const rawByPlatform = progress.byPlatform && typeof progress.byPlatform === "object"
    ? progress.byPlatform as Record<string, unknown>
    : {};
  const byPlatform: Record<string, { processed: number; total: number }> = {};
  for (const slug of WALLAPOP_CAMPAIGN_PLATFORMS) {
    const row = rawByPlatform[slug] && typeof rawByPlatform[slug] === "object"
      ? rawByPlatform[slug] as UnknownRecord
      : {};
    byPlatform[slug] = {
      processed: Math.max(0, cleanNumber(row.processed)),
      total: Math.max(0, cleanNumber(row.total)),
    };
  }
  const lastError = value.lastError && typeof value.lastError === "object"
    ? value.lastError as UnknownRecord
    : {};
  const normalizedPlatforms = cleanStringArray(
    settings.platforms,
    WALLAPOP_CAMPAIGN_PLATFORMS.length,
  ).filter((slug) => (WALLAPOP_CAMPAIGN_PLATFORMS as readonly string[]).includes(slug));
  return {
    available: true,
    enabled: value.enabled === true,
    status: cleanText(value.status, 80) ?? "unknown",
    campaignId: cleanText(value.campaignId, 80),
    startedAt: cleanText(value.startedAt, 80),
    updatedAt: cleanText(value.updatedAt, 80),
    completedAt: cleanText(value.completedAt, 80),
    nextRunAt: cleanText(value.nextRunAt, 80),
    lastAction: cleanText(value.lastAction, 120),
    settings: {
      platforms: normalizedPlatforms.length
        ? normalizedPlatforms
        : [...WALLAPOP_CAMPAIGN_PLATFORMS],
      targetRegion: cleanText(settings.targetRegion, 80) ?? "PAL España",
      batchSize: Math.min(WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE, Math.max(1, cleanNumber(settings.batchSize, 20))),
      maxBatchSize: Math.min(WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE, Math.max(1, cleanNumber(settings.maxBatchSize, 20))),
      pauseMinutes: Math.max(WALLAPOP_CAMPAIGN_PAUSE_MINUTES, cleanNumber(settings.pauseMinutes, 10)),
      jitterMinutes: Math.max(0, cleanNumber(settings.jitterMinutes, 3)),
      autoPublish: settings.autoPublish === true,
    },
    progress: {
      processedGames: Math.max(0, cleanNumber(progress.processedGames)),
      totalGames: Math.max(0, cleanNumber(progress.totalGames)),
      completedPlatforms: Math.max(0, cleanNumber(progress.completedPlatforms)),
      totalPlatforms: Math.max(0, cleanNumber(progress.totalPlatforms, WALLAPOP_CAMPAIGN_PLATFORMS.length)),
      byPlatform,
    },
    activeBatch: normalizeBatch(value.activeBatch),
    lastBatch: normalizeBatch(value.lastBatch),
    readyArtifactCount: Math.max(0, cleanNumber(value.readyArtifactCount)),
    error: cleanText(lastError.message),
    consecutiveErrors: Math.max(0, cleanNumber(value.consecutiveErrors)),
  };
}

function normalizeControlStatus(value: UnknownRecord | null): WallapopCampaignControlStatus {
  const action = cleanText(value?.action, 20);
  return {
    available: Boolean(value),
    ok: typeof value?.ok === "boolean" ? value.ok : null,
    status: cleanText(value?.status, 80) ?? "not_reported",
    requestId: cleanText(value?.requestId, 160),
    action: action === "enable" || action === "disable" || action === "restart" ? action : null,
    requestedAt: cleanText(value?.requestedAt, 80),
    finishedAt: cleanText(value?.finishedAt, 80),
    error: cleanText(value?.error),
  };
}

function publicBaseUrl(): string {
  const covers = process.env.NEXT_PUBLIC_COVERS_BASE_URL || "https://www.puntoracing.net/MEDIAREGIONATLAS/covers";
  return (process.env.PRICE_WORKER_PUBLIC_URL || covers.replace(/\/covers\/?$/i, "/price-worker"))
    .replace(/\/$/, "");
}

async function fetchWorkerJson(relativePath: string): Promise<UnknownRecord | null> {
  try {
    const response = await fetch(`${publicBaseUrl()}/${relativePath.replace(/^\//, "")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 128 * 1024) return null;
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as UnknownRecord
      : null;
  } catch {
    return null;
  }
}

function controlEnvironmentReady(): { ready: boolean; reason: string | null } {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() !== "production") {
    return { ready: false, reason: "El robot solo se controla desde producción." };
  }
  if (process.env.VERCEL_GIT_COMMIT_REF?.trim() && process.env.VERCEL_GIT_COMMIT_REF?.trim() !== "main") {
    return { ready: false, reason: "El deployment activo no corresponde a main." };
  }
  const config = resolveWorkerSftpConfig();
  if (!config) return { ready: false, reason: "SFTP del PC worker no configurado." };
  if (config.protocol !== "sftp") return { ready: false, reason: "El control seguro necesita SFTP." };
  return { ready: true, reason: null };
}

export function isWallapopCampaignAction(value: unknown): value is WallapopCampaignAction {
  return value === "enable" || value === "disable" || value === "restart";
}

export function buildWallapopCampaignControlRequest(
  action: WallapopCampaignAction,
  options: { now?: Date; suffix?: string } = {},
) {
  const now = options.now ?? new Date();
  const suffix = (options.suffix || Math.random().toString(36).slice(2, 8))
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 12) || "request";
  const requestId = `wallapop-control-${now.getTime()}-${suffix}`;
  return {
    schemaVersion: 1,
    mode: WALLAPOP_CAMPAIGN_CONTROL_MODE,
    requestId,
    requestedAt: now.toISOString(),
    action,
    platforms: [...WALLAPOP_CAMPAIGN_PLATFORMS],
    batchSize: WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE,
    pauseMinutes: WALLAPOP_CAMPAIGN_PAUSE_MINUTES,
    jitterMinutes: 3,
  };
}

async function writeWorkerJsonFiles(files: Array<{ remote: string; value: UnknownRecord }>): Promise<void> {
  const config = resolveWorkerSftpConfig();
  if (!config) throw new Error("SFTP del PC worker no configurado.");
  if (config.protocol !== "sftp") throw new Error("El control seguro necesita SFTP.");
  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: UnknownRecord): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      readyTimeout: 60_000,
      retries: 1,
    });
    for (const file of files) {
      const remotePath = path.posix.join(config.remoteDir, file.remote);
      await client.mkdir(path.posix.dirname(remotePath), true);
      await client.put(Buffer.from(`${JSON.stringify(file.value, null, 2)}\n`, "utf8"), remotePath);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function getWallapopCampaignOverview(): Promise<WallapopCampaignOverview> {
  const [campaignValue, controlValue, worker] = await Promise.all([
    fetchWorkerJson("cron/wallapop-pal-status.json"),
    fetchWorkerJson("cron/wallapop-pal-control-status.json"),
    getPcWorkerUpdateOverview(),
  ]);
  const readiness = controlEnvironmentReady();
  const targetSha = resolvePcWorkerDeploymentSha();
  const workerAligned = Boolean(
    targetSha
      && worker.health.git.commitSha === targetSha
      && worker.health.git.branch === "main"
      && worker.health.git.clean === true,
  );
  const canEnable = readiness.ready && workerAligned;
  return {
    campaign: normalizeWallapopCampaignStatus(campaignValue),
    control: normalizeControlStatus(controlValue),
    canEnable,
    canDisable: readiness.ready,
    controlBlockReason: readiness.reason || (workerAligned
      ? null
      : "Actualiza primero el PC al mismo commit que producción."),
  };
}

export async function queueWallapopCampaignControl(action: WallapopCampaignAction) {
  const overview = await getWallapopCampaignOverview();
  if (action === "disable" && !overview.canDisable) {
    throw new Error(overview.controlBlockReason || "No se puede apagar el robot desde este entorno.");
  }
  if (action !== "disable" && !overview.canEnable) {
    throw new Error(overview.controlBlockReason || "El PC worker no está listo para encender el robot.");
  }
  const request = buildWallapopCampaignControlRequest(action);
  const queued = {
    ok: true,
    status: "queued",
    requestId: request.requestId,
    action,
    requestedAt: request.requestedAt,
  };
  await writeWorkerJsonFiles([
    { remote: "cron/wallapop-pal-control-status.json", value: queued },
    { remote: `jobs/wallapop-control-requests/${request.requestId}.json`, value: request },
  ]);
  return queued;
}
