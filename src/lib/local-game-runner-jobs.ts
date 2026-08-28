import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { appDataDir } from "./app-data-dir";
import { canWriteCatalogFiles } from "./admin-auth";
import { priceWorkerPublicBaseUrl } from "./admin-price-collect";
import {
  normalizeGameReleaseDiscoveryResult,
  type GameReleaseDiscoveryPlatform,
  type GameReleaseDiscoveryResult,
} from "./game-release-discovery";

const JOBS_FILE =
  process.env.LOCAL_GAME_RUNNER_JOBS_FILE ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "local-game-runner-jobs.json")
    : path.join(process.cwd(), "data", "admin", "local-game-runner-jobs.json"));

export type LocalGameRunnerOfferType = "new" | "preowned";
export type LocalGameRunnerStatus = "pending" | "running" | "done" | "error" | "cancelled";
export type LocalGameRunnerJobType = "api_collect" | "manual_paste" | "catalog_discovery";
export type LocalGameRunnerPlatform = "ps4" | "ps5" | "switch2";
export type CatalogDiscoveryReview = {
  status: "draft_created" | "dismissed";
  reviewedAt: string;
  pcId?: number | null;
  catalogId?: string | null;
};

export type LocalGameRunnerJob = {
  id: string;
  jobType?: LocalGameRunnerJobType;
  status: LocalGameRunnerStatus;
  source: "game-es";
  platformSlug: LocalGameRunnerPlatform;
  offerType: LocalGameRunnerOfferType;
  limit: number;
  startPage: number;
  maxPages: number;
  skipRecentDays: number;
  repeatStopCount?: number;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string | null;
  finishedAt?: string | null;
  runnerId?: string | null;
  resultPath?: string | null;
  pastedTextPath?: string | null;
  importedAt?: string | null;
  importStatus?: "not_imported" | "importing" | "imported" | "error" | null;
  importLogTail?: string | null;
  importError?: string | null;
  resultSummary?: {
    productsDetected?: number | null;
    rows?: number | null;
    matchedByAi?: number | null;
    review?: number | null;
    candidates?: number | null;
    existing?: number | null;
    seenBefore?: number | null;
  } | null;
  catalogDiscoveryReviews?: Record<string, CatalogDiscoveryReview>;
  logTail?: string | null;
  error?: string | null;
};

type LocalGameRunnerQueue = {
  schemaVersion: number;
  updatedAt: string;
  jobs: LocalGameRunnerJob[];
};

export type CreateLocalGameRunnerJobInput = {
  jobType?: string;
  platformSlug?: string;
  offerType?: string;
  limit?: number;
  startPage?: number;
  maxPages?: number;
  skipRecentDays?: number;
  repeatStopCount?: number;
};

export type GamePastePreviewProduct = {
  title: string;
  priceEur: number;
};

export type GamePastePreview = {
  products: GamePastePreviewProduct[];
  skipped: Array<GamePastePreviewProduct & { reason: string }>;
  stats: {
    pastedLines: number;
    parsedProducts: number;
    skippedLikelyNonGames: number;
    duplicateSkipped: number;
    strayPrices: number;
    unmatchedLines: number;
  };
};

export type ImportGamePasteInput = {
  platformSlug?: string;
  offerType?: string;
  pastedText?: string;
};

const GAME_PASTE_PRICE_RE = /(\d{1,5})\s*['’]\s*(\d{2})\s*€/;
const GAME_PASTE_BUY_WORDS = new Set(["comprar", "añadir", "anadir"]);
const GAME_PASTE_NON_GAME_RE =
  /\b(figura|figurine|funko|amiibo|peluche|camiseta|poster|póster|merchandising|mando|controller|consola|auriculares|headset|accesorio|accesorios|cargador|cable|funda|soporte|volante|teclado|rat[oó]n|alfombrilla|skin|pack consola)\b/i;
const STALE_RUNNING_JOB_MS = 45 * 60 * 1000;

function emptyQueue(): LocalGameRunnerQueue {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), jobs: [] };
}

function cleanGamePasteLine(value: string): string {
  return value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
}

function parseGamePastePrice(value: string): number | null {
  const match = GAME_PASTE_PRICE_RE.exec(value);
  if (!match) return null;
  return Number(`${match[1]}.${match[2]}`);
}

function isGamePasteBuyLine(value: string): boolean {
  return GAME_PASTE_BUY_WORDS.has(cleanGamePasteLine(value).toLowerCase());
}

export function previewGamePasteText(text: string): GamePastePreview {
  const lines = text
    .split(/\r?\n/)
    .map(cleanGamePasteLine)
    .filter(Boolean);
  const products: GamePastePreviewProduct[] = [];
  const skipped: Array<GamePastePreviewProduct & { reason: string }> = [];
  const seen = new Set<string>();
  let duplicateSkipped = 0;
  let strayPrices = 0;
  let unmatchedLines = 0;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (parseGamePastePrice(line) !== null) {
      strayPrices += 1;
      index += 1;
      continue;
    }
    if (isGamePasteBuyLine(line)) {
      unmatchedLines += 1;
      index += 1;
      continue;
    }

    const title = line.replace(/^[\s\-·]+|[\s\-·]+$/g, "");
    let nextIndex = index + 1;
    if ((lines[nextIndex] ?? "").toLowerCase() === line.toLowerCase()) nextIndex += 1;
    if (isGamePasteBuyLine(lines[nextIndex] ?? "")) nextIndex += 1;
    const price = parseGamePastePrice(lines[nextIndex] ?? "");
    if (price === null) {
      unmatchedLines += 1;
      index += 1;
      continue;
    }

    const key = `${title.toLowerCase()}|${price.toFixed(2)}`;
    if (seen.has(key)) {
      duplicateSkipped += 1;
      index = nextIndex + 1;
      continue;
    }
    seen.add(key);
    if (GAME_PASTE_NON_GAME_RE.test(title)) {
      skipped.push({ title, priceEur: price, reason: "Parece accesorio/merchandising" });
      index = nextIndex + 1;
      continue;
    }
    products.push({ title, priceEur: price });
    index = nextIndex + 1;
  }

  return {
    products,
    skipped,
    stats: {
      pastedLines: lines.length,
      parsedProducts: products.length,
      skippedLikelyNonGames: skipped.length,
      duplicateSkipped,
      strayPrices,
      unmatchedLines,
    },
  };
}

function normalizeCatalogDiscoveryReviews(value: unknown): Record<string, CatalogDiscoveryReview> {
  if (!value || typeof value !== "object") return {};
  const entries: Array<[string, CatalogDiscoveryReview]> = [];
  for (const [rawSku, rawReview] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
    const sourceSku = rawSku.trim().slice(0, 80);
    if (!sourceSku || !rawReview || typeof rawReview !== "object") continue;
    const review = rawReview as Partial<CatalogDiscoveryReview>;
    if (review.status !== "draft_created" && review.status !== "dismissed") continue;
    entries.push([
      sourceSku,
      {
        status: review.status,
        reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : new Date().toISOString(),
        pcId: Number.isFinite(review.pcId) ? Number(review.pcId) : null,
        catalogId: typeof review.catalogId === "string" ? review.catalogId.slice(0, 240) : null,
      },
    ]);
  }
  return Object.fromEntries(entries);
}

function normalizeJob(input: unknown): LocalGameRunnerJob | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<LocalGameRunnerJob>;
  const platformSlug: LocalGameRunnerPlatform | null =
    raw.platformSlug === "switch2"
      ? "switch2"
      : raw.platformSlug === "ps5"
        ? "ps5"
        : raw.platformSlug === "ps4"
          ? "ps4"
          : null;
  const offerType = raw.offerType === "new" ? "new" : raw.offerType === "preowned" ? "preowned" : null;
  if (!raw.id || !platformSlug || !offerType) return null;
  const status: LocalGameRunnerStatus =
    raw.status === "running" || raw.status === "done" || raw.status === "error" || raw.status === "cancelled"
      ? raw.status
      : "pending";
  const jobType: LocalGameRunnerJobType =
    raw.jobType === "catalog_discovery"
      ? "catalog_discovery"
      : raw.jobType === "manual_paste"
        ? "manual_paste"
        : "api_collect";
  if (jobType !== "catalog_discovery" && platformSlug === "switch2") return null;
  return {
    id: String(raw.id),
    status,
    jobType,
    source: "game-es",
    platformSlug,
    offerType,
    limit: Math.max(
      1,
      Math.min(jobType === "manual_paste" ? 5000 : jobType === "catalog_discovery" ? 200 : 60, Number(raw.limit) || 20),
    ),
    startPage: Math.max(0, Math.min(20, Number(raw.startPage) || 0)),
    maxPages: Math.max(1, Math.min(jobType === "catalog_discovery" ? 10 : 8, Number(raw.maxPages) || 1)),
    skipRecentDays: Math.max(0, Math.min(jobType === "catalog_discovery" ? 365 : 30, Number(raw.skipRecentDays) || 0)),
    repeatStopCount: jobType === "catalog_discovery" ? Math.max(0, Math.min(10, Number(raw.repeatStopCount) || 3)) : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    claimedAt: raw.claimedAt ?? null,
    finishedAt: raw.finishedAt ?? null,
    runnerId: raw.runnerId ?? null,
    resultPath: raw.resultPath ?? null,
    pastedTextPath: raw.pastedTextPath ?? null,
    importedAt: raw.importedAt ?? null,
    importStatus: raw.importStatus ?? null,
    importLogTail: raw.importLogTail ?? null,
    importError: raw.importError ?? null,
    resultSummary: raw.resultSummary ?? null,
    catalogDiscoveryReviews:
      jobType === "catalog_discovery" ? normalizeCatalogDiscoveryReviews(raw.catalogDiscoveryReviews) : undefined,
    logTail: raw.logTail ?? null,
    error: raw.error ?? null,
  };
}

function normalizeQueue(input: unknown): LocalGameRunnerQueue {
  const raw = input && typeof input === "object" ? (input as Partial<LocalGameRunnerQueue>) : {};
  return {
    schemaVersion: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    jobs: Array.isArray(raw.jobs) ? raw.jobs.map(normalizeJob).filter((job): job is LocalGameRunnerJob => Boolean(job)) : [],
  };
}

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function workerSftpConfig(): { host: string; port: number; username: string; password: string } | null {
  const host = process.env.PRICE_WORKER_SFTP_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim() || process.env.PRICE_WORKER_SSH_HOST?.trim();
  const username = process.env.PRICE_WORKER_SFTP_USER?.trim() || process.env.COVERS_FTP_USER?.trim() || process.env.PRICE_WORKER_SSH_USER?.trim();
  const password = process.env.PRICE_WORKER_SFTP_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim() || process.env.PRICE_WORKER_SSH_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SFTP_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim() || process.env.PRICE_WORKER_SSH_PORT?.trim();
  return { host, port: portRaw ? Number(portRaw) : 22, username, password };
}

async function readQueueFromWorker(): Promise<LocalGameRunnerQueue | null> {
  try {
    const response = await fetch(`${priceWorkerPublicBaseUrl()}/app/data/admin/local-game-runner-jobs.json`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return normalizeQueue(await response.json());
  } catch {
    return null;
  }
}

function readQueueFromDisk(): LocalGameRunnerQueue {
  try {
    return normalizeQueue(JSON.parse(readFileSync(JOBS_FILE, "utf8")));
  } catch {
    return emptyQueue();
  }
}

async function writeWorkerFile(remote: string, payload: Buffer): Promise<{ ok: true } | { error: string }> {
  const config = workerSftpConfig();
  if (!config) return { error: "SFTP del worker no configurado." };
  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  const remotePath = path.posix.join(priceWorkerRemoteRoot(), remote);
  try {
    await client.connect({ ...config, readyTimeout: 60_000, retries: 1 });
    await client.mkdir(path.posix.dirname(remotePath), true);
    await client.put(payload, remotePath);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo sincronizar el worker." };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function writeQueue(queue: LocalGameRunnerQueue): Promise<{ ok: true } | { error: string }> {
  queue.updatedAt = new Date().toISOString();
  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    mkdirSync(path.dirname(JOBS_FILE), { recursive: true });
    writeFileSync(JOBS_FILE, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }
  return writeWorkerFile("app/data/admin/local-game-runner-jobs.json", Buffer.from(`${JSON.stringify(queue, null, 2)}\n`, "utf8"));
}

function queueWithRecentJobs(queue: LocalGameRunnerQueue): LocalGameRunnerQueue {
  return {
    ...queue,
    jobs: [...queue.jobs]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 80),
  };
}

function markStaleRunningJobs(queue: LocalGameRunnerQueue): boolean {
  const nowMs = Date.now();
  let changed = false;
  for (const job of queue.jobs) {
    if (job.status !== "running") continue;
    const startedAtMs = Date.parse(job.claimedAt || job.updatedAt || job.createdAt);
    if (!Number.isFinite(startedAtMs) || nowMs - startedAtMs < STALE_RUNNING_JOB_MS) continue;
    const now = new Date().toISOString();
    job.status = "error";
    job.updatedAt = now;
    job.finishedAt = now;
    job.error =
      "El runner del Mac dejó este job en ejecución demasiado tiempo. Puede reintentarse creando otro job; no se han aplicado precios automáticamente.";
    job.logTail = [job.logTail, "Job marcado como error por autocuración: ejecución local caducada."]
      .filter(Boolean)
      .join("\n")
      .slice(-12000);
    changed = true;
  }
  return changed;
}

async function readQueueWithStaleRecovery(): Promise<LocalGameRunnerQueue> {
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  if (markStaleRunningJobs(queue)) {
    await writeQueue(queue);
  }
  return queue;
}

export async function listLocalGameRunnerJobs(limit = 20): Promise<LocalGameRunnerJob[]> {
  const queue = await readQueueWithStaleRecovery();
  return [...queue.jobs]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(80, limit)));
}

export async function createLocalGameRunnerJob(
  input: CreateLocalGameRunnerJobInput,
): Promise<{ ok: true; job: LocalGameRunnerJob } | { error: string }> {
  const jobType: LocalGameRunnerJobType = input.jobType === "catalog_discovery" ? "catalog_discovery" : "api_collect";
  if (jobType === "catalog_discovery") {
    const platformSlug = input.platformSlug === "switch2"
      ? "switch2"
      : input.platformSlug === "ps5"
        ? "ps5"
        : input.platformSlug === "ps4"
          ? "ps4"
          : null;
    if (!platformSlug) return { error: "Elige PS4, PS5 o Switch 2 para descubrir lanzamientos." };
    const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
    const active = queue.jobs.find(
      (job) =>
        job.jobType === "catalog_discovery" &&
        job.platformSlug === platformSlug &&
        (job.status === "pending" || job.status === "running"),
    );
    if (active) {
      const label = platformSlug === "ps4" ? "PS4" : platformSlug === "ps5" ? "PS5" : "Switch 2";
      return { error: `Ya hay una búsqueda de ${label} esperando o en marcha.` };
    }

    const now = new Date().toISOString();
    const job: LocalGameRunnerJob = {
      id: `local-game-release-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      jobType,
      status: "pending",
      source: "game-es",
      platformSlug,
      offerType: "new",
      limit: Math.max(1, Math.min(200, Number(input.limit) || 80)),
      startPage: 0,
      maxPages: Math.max(1, Math.min(10, Number(input.maxPages) || 4)),
      skipRecentDays: Math.max(1, Math.min(365, Number(input.skipRecentDays) || 365)),
      repeatStopCount: Math.max(1, Math.min(10, Number(input.repeatStopCount) || 3)),
      catalogDiscoveryReviews: {},
      createdAt: now,
      updatedAt: now,
    };
    queue.jobs.unshift(job);
    const written = await writeQueue(queue);
    if ("error" in written) return written;
    return { ok: true, job };
  }

  const platformSlug = input.platformSlug === "ps5" ? "ps5" : input.platformSlug === "ps4" ? "ps4" : null;
  const offerType = input.offerType === "new" ? "new" : input.offerType === "preowned" ? "preowned" : null;
  if (!platformSlug || !offerType) return { error: "Elige plataforma PS4/PS5 y tipo nuevo/seminuevo." };
  const limit = Math.max(1, Math.min(60, Number(input.limit) || 20));
  const startPage = Math.max(0, Math.min(20, Number(input.startPage) || 0));
  const maxPages = Math.max(1, Math.min(8, Number(input.maxPages) || 1));
  const skipRecentDays = Math.max(0, Math.min(30, Number(input.skipRecentDays) || 0));
  const now = new Date().toISOString();
  const job: LocalGameRunnerJob = {
    id: `local-game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    jobType: "api_collect",
    status: "pending",
    source: "game-es",
    platformSlug,
    offerType,
    limit,
    startPage,
    maxPages,
    skipRecentDays,
    createdAt: now,
    updatedAt: now,
  };
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  queue.jobs.unshift(job);
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  return { ok: true, job };
}

export async function ensureScheduledGameReleaseDiscoveryJobs(): Promise<{
  ok: true;
  created: LocalGameRunnerJob[];
  skipped: Array<{ platformSlug: GameReleaseDiscoveryPlatform; reason: string }>;
} | { error: string }> {
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  const now = new Date();
  const recentCutoff = now.getTime() - 6 * 24 * 60 * 60 * 1000;
  const created: LocalGameRunnerJob[] = [];
  const skipped: Array<{ platformSlug: GameReleaseDiscoveryPlatform; reason: string }> = [];

  for (const platformSlug of ["ps4", "ps5", "switch2"] as const) {
    const related = queue.jobs.filter(
      (job) => job.jobType === "catalog_discovery" && job.platformSlug === platformSlug,
    );
    if (related.some((job) => job.status === "pending" || job.status === "running")) {
      skipped.push({ platformSlug, reason: "active_job" });
      continue;
    }
    const latestCompleted = related
      .filter((job) => job.status === "done")
      .sort((a, b) => Date.parse(b.finishedAt ?? b.updatedAt) - Date.parse(a.finishedAt ?? a.updatedAt))[0];
    if (latestCompleted && Date.parse(latestCompleted.finishedAt ?? latestCompleted.updatedAt) >= recentCutoff) {
      skipped.push({ platformSlug, reason: "completed_this_week" });
      continue;
    }

    const at = now.toISOString();
    const job: LocalGameRunnerJob = {
      id: `local-game-release-${Date.now().toString(36)}-${platformSlug}-${Math.random().toString(36).slice(2, 7)}`,
      jobType: "catalog_discovery",
      status: "pending",
      source: "game-es",
      platformSlug,
      offerType: "new",
      limit: 80,
      startPage: 0,
      maxPages: 4,
      skipRecentDays: 365,
      repeatStopCount: 3,
      catalogDiscoveryReviews: {},
      createdAt: at,
      updatedAt: at,
    };
    queue.jobs.unshift(job);
    created.push(job);
  }

  if (created.length > 0) {
    const written = await writeQueue(queue);
    if ("error" in written) return written;
  }
  return { ok: true, created, skipped };
}

export function localGameRunnerTokenConfigured(): boolean {
  return Boolean(process.env.LOCAL_GAME_RUNNER_TOKEN?.trim());
}

export function assertLocalGameRunnerToken(request: Request): boolean {
  const expected = process.env.LOCAL_GAME_RUNNER_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return token === expected;
}

export async function claimNextLocalGameRunnerJob(
  runnerId: string,
): Promise<{ ok: true; job: LocalGameRunnerJob | null } | { error: string }> {
  const queue = await readQueueWithStaleRecovery();
  const job = queue.jobs
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .find((item) => item.status === "pending");
  if (!job) return { ok: true, job: null };
  const now = new Date().toISOString();
  job.status = "running";
  job.claimedAt = now;
  job.updatedAt = now;
  job.runnerId = runnerId || "mac-local";
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  return { ok: true, job };
}

function summarizeResult(result: unknown): LocalGameRunnerJob["resultSummary"] {
  const raw = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const listings = Array.isArray(raw.listings) ? raw.listings : [];
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  const stats = raw.stats && typeof raw.stats === "object" ? (raw.stats as Record<string, unknown>) : {};
  return {
    productsDetected: Number(stats.products ?? stats.products_matched ?? stats.rawProducts ?? listings.length) || null,
    rows: listings.length,
    matchedByAi: Number(stats.matched_by_ai ?? 0) || 0,
    review: listings.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).regionReviewNeeded).length,
    candidates: candidates.length,
    existing: Number(stats.existing ?? 0) || 0,
    seenBefore: Number(stats.seenBefore ?? 0) || 0,
  };
}

export async function completeLocalGameRunnerJob(input: {
  jobId: string;
  runnerId?: string;
  ok: boolean;
  result?: unknown;
  log?: string;
  error?: string;
}): Promise<{ ok: true; job: LocalGameRunnerJob } | { error: string }> {
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  const job = queue.jobs.find((item) => item.id === input.jobId);
  if (!job) return { error: "Job local no encontrado." };
  const discoveryResult = job.jobType === "catalog_discovery" && input.ok
    ? normalizeGameReleaseDiscoveryResult(input.result)
    : null;
  const incompatibleDiscoveryResult = job.jobType === "catalog_discovery" && input.ok && !discoveryResult;
  const now = new Date().toISOString();
  const logTail = String(input.log ?? "").slice(-12000);
  job.status = input.ok && !incompatibleDiscoveryResult ? "done" : "error";
  job.finishedAt = now;
  job.updatedAt = now;
  job.runnerId = input.runnerId || job.runnerId || "mac-local";
  job.logTail = logTail || null;
  job.error = incompatibleDiscoveryResult
    ? "El runner devolvió un formato antiguo o con precios. Actualiza el código del runner antes de reintentar; no se ha importado ningún dato."
    : input.ok
      ? null
      : String(input.error || "El runner local informó error.");
  if (input.ok && !incompatibleDiscoveryResult && input.result) {
    const resultPath = job.jobType === "catalog_discovery"
      ? `app/data/catalog-discovery/local-game/${job.id}.json`
      : `app/data/price-ingest/local-game/${job.id}.json`;
    const safeResult = discoveryResult ?? input.result;
    const resultWritten = await writeWorkerFile(resultPath, Buffer.from(`${JSON.stringify(safeResult, null, 2)}\n`, "utf8"));
    if ("error" in resultWritten) return resultWritten;
    job.resultPath = resultPath;
    job.resultSummary = summarizeResult(safeResult);
  }
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  return { ok: true, job };
}

export async function importLocalGameRunnerJob(jobId: string): Promise<{ ok: true; job: LocalGameRunnerJob } | { error: string }> {
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  const job = queue.jobs.find((item) => item.id === jobId);
  if (!job) return { error: "Job local no encontrado." };
  if (job.jobType === "catalog_discovery") {
    return { error: "Los lanzamientos se revisan como fichas de catálogo; no se importan al flujo de precios." };
  }
  if (job.status !== "done") return { error: "Solo se pueden importar jobs completados." };
  if (!job.resultPath) return { error: "El job no tiene JSON de resultado en el worker." };

  const now = new Date().toISOString();
  job.updatedAt = now;
  job.importStatus = "importing";
  job.importError = null;
  job.importLogTail = "Importación solicitada por SFTP. El cron del hosting la aplicará sin SSH.";
  const request = {
    jobId: job.id,
    platformSlug: job.platformSlug,
    resultPath: job.resultPath,
    requestedAt: now,
  };
  const requestWritten = await writeWorkerFile(
    `jobs/import-requests/${job.id}.json`,
    Buffer.from(`${JSON.stringify(request, null, 2)}\n`, "utf8"),
  );
  if ("error" in requestWritten) return requestWritten;
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  return { ok: true, job };
}

export async function readGameReleaseDiscoveryResult(
  jobId: string,
): Promise<{ ok: true; job: LocalGameRunnerJob; result: GameReleaseDiscoveryResult } | { error: string }> {
  const queue = await readQueueWithStaleRecovery();
  const job = queue.jobs.find((item) => item.id === jobId);
  if (!job || job.jobType !== "catalog_discovery") return { error: "Búsqueda de lanzamientos no encontrada." };
  if (job.status !== "done" || !job.resultPath) return { error: "La búsqueda todavía no tiene resultado revisable." };
  if (!job.resultPath.startsWith("app/data/catalog-discovery/local-game/")) return { error: "Ruta de resultado no válida." };
  const publicBaseUrl = priceWorkerPublicBaseUrl();
  if (!publicBaseUrl) return { error: "URL pública del worker no configurada." };
  try {
    const response = await fetch(`${publicBaseUrl}/${job.resultPath.replace(/^\/+/, "")}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { error: `El worker devolvió HTTP ${response.status} al leer candidatos.` };
    const result = normalizeGameReleaseDiscoveryResult(await response.json());
    if (!result) return { error: "El resultado GAME no tiene el formato seguro esperado." };
    if (result.platformSlug !== job.platformSlug) return { error: "La plataforma del resultado no coincide con el job." };
    return { ok: true, job, result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo leer el resultado GAME." };
  }
}

export async function recordGameReleaseDiscoveryReview(input: {
  jobId: string;
  sourceSku: string;
  status: CatalogDiscoveryReview["status"];
  pcId?: number | null;
  catalogId?: string | null;
}): Promise<{ ok: true; job: LocalGameRunnerJob; review: CatalogDiscoveryReview } | { error: string }> {
  const sourceSku = input.sourceSku.trim().slice(0, 80);
  if (!sourceSku) return { error: "Falta el SKU GAME del candidato." };
  const result = await readGameReleaseDiscoveryResult(input.jobId);
  if ("error" in result) return result;
  if (!result.result.candidates.some((candidate) => candidate.sourceSku === sourceSku)) {
    return { error: "El candidato no pertenece a este resultado GAME." };
  }

  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  const job = queue.jobs.find((item) => item.id === input.jobId);
  if (!job || job.jobType !== "catalog_discovery") return { error: "Búsqueda de lanzamientos no encontrada." };
  const review: CatalogDiscoveryReview = {
    status: input.status,
    reviewedAt: new Date().toISOString(),
    pcId: Number.isFinite(input.pcId) ? Number(input.pcId) : null,
    catalogId: input.catalogId?.trim().slice(0, 240) || null,
  };
  job.catalogDiscoveryReviews = {
    ...(job.catalogDiscoveryReviews ?? {}),
    [sourceSku]: review,
  };
  job.updatedAt = review.reviewedAt;
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  return { ok: true, job, review };
}

export async function importGamePasteText(
  input: ImportGamePasteInput,
): Promise<
  | {
      ok: true;
      importId: string;
      job: LocalGameRunnerJob;
      preview: GamePastePreview;
    }
  | { error: string; preview?: GamePastePreview }
> {
  const platformSlug = input.platformSlug === "ps5" ? "ps5" : input.platformSlug === "ps4" ? "ps4" : null;
  const offerType = input.offerType === "new" ? "new" : input.offerType === "preowned" ? "preowned" : null;
  if (!platformSlug || !offerType) return { error: "Elige plataforma PS4/PS5 y tipo nuevo/seminuevo." };
  const pastedText = String(input.pastedText ?? "").trim();
  if (pastedText.length < 20) return { error: "Pega el bloque de productos de GAME antes de importar." };
  const preview = previewGamePasteText(pastedText);
  if (preview.stats.parsedProducts <= 0) return { error: "No he detectado productos GAME en ese texto.", preview };

  const importId = `game-paste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const textPath = `app/data/price-ingest/local-game-paste/${importId}.txt`;
  const written = await writeWorkerFile(textPath, Buffer.from(`${pastedText}\n`, "utf8"));
  if ("error" in written) return { error: written.error, preview };

  const now = new Date().toISOString();
  const job: LocalGameRunnerJob = {
    id: importId,
    jobType: "manual_paste",
    status: "pending",
    source: "game-es",
    platformSlug,
    offerType,
    limit: preview.stats.parsedProducts,
    startPage: 0,
    maxPages: 1,
    skipRecentDays: 0,
    createdAt: now,
    updatedAt: now,
    pastedTextPath: textPath,
  };
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  queue.jobs.unshift(job);
  const queued = await writeQueue(queue);
  if ("error" in queued) return { error: queued.error, preview };
  return { ok: true, importId, job, preview };
}
