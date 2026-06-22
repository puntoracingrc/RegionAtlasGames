import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { appDataDir } from "./app-data-dir";
import { canWriteCatalogFiles } from "./admin-auth";
import { priceWorkerPublicBaseUrl } from "./admin-price-collect";

const JOBS_FILE =
  process.env.LOCAL_GAME_RUNNER_JOBS_FILE ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "local-game-runner-jobs.json")
    : path.join(process.cwd(), "data", "admin", "local-game-runner-jobs.json"));

export type LocalGameRunnerOfferType = "new" | "preowned";
export type LocalGameRunnerStatus = "pending" | "running" | "done" | "error" | "cancelled";

export type LocalGameRunnerJob = {
  id: string;
  jobType?: "api_collect" | "manual_paste";
  status: LocalGameRunnerStatus;
  source: "game-es";
  platformSlug: "ps4" | "ps5";
  offerType: LocalGameRunnerOfferType;
  limit: number;
  startPage: number;
  maxPages: number;
  skipRecentDays: number;
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
  } | null;
  logTail?: string | null;
  error?: string | null;
};

type LocalGameRunnerQueue = {
  schemaVersion: number;
  updatedAt: string;
  jobs: LocalGameRunnerJob[];
};

export type CreateLocalGameRunnerJobInput = {
  platformSlug?: string;
  offerType?: string;
  limit?: number;
  startPage?: number;
  maxPages?: number;
  skipRecentDays?: number;
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

function normalizeJob(input: unknown): LocalGameRunnerJob | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<LocalGameRunnerJob>;
  const platformSlug = raw.platformSlug === "ps5" ? "ps5" : raw.platformSlug === "ps4" ? "ps4" : null;
  const offerType = raw.offerType === "new" ? "new" : raw.offerType === "preowned" ? "preowned" : null;
  if (!raw.id || !platformSlug || !offerType) return null;
  const status: LocalGameRunnerStatus =
    raw.status === "running" || raw.status === "done" || raw.status === "error" || raw.status === "cancelled"
      ? raw.status
      : "pending";
  const jobType = raw.jobType === "manual_paste" ? "manual_paste" : "api_collect";
  return {
    id: String(raw.id),
    status,
    jobType,
    source: "game-es",
    platformSlug,
    offerType,
    limit: Math.max(1, Math.min(jobType === "manual_paste" ? 5000 : 60, Number(raw.limit) || 20)),
    startPage: Math.max(0, Math.min(20, Number(raw.startPage) || 0)),
    maxPages: Math.max(1, Math.min(8, Number(raw.maxPages) || 1)),
    skipRecentDays: Math.max(0, Math.min(30, Number(raw.skipRecentDays) || 0)),
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

export async function listLocalGameRunnerJobs(limit = 20): Promise<LocalGameRunnerJob[]> {
  const queue = (await readQueueFromWorker()) ?? readQueueFromDisk();
  return [...queue.jobs]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(80, limit)));
}

export async function createLocalGameRunnerJob(
  input: CreateLocalGameRunnerJobInput,
): Promise<{ ok: true; job: LocalGameRunnerJob } | { error: string }> {
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
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
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
  const stats = raw.stats && typeof raw.stats === "object" ? (raw.stats as Record<string, unknown>) : {};
  return {
    productsDetected: Number(stats.products ?? stats.products_matched ?? stats.rawProducts ?? listings.length) || null,
    rows: listings.length,
    matchedByAi: Number(stats.matched_by_ai ?? 0) || 0,
    review: listings.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).regionReviewNeeded).length,
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
  const now = new Date().toISOString();
  const logTail = String(input.log ?? "").slice(-12000);
  job.status = input.ok ? "done" : "error";
  job.finishedAt = now;
  job.updatedAt = now;
  job.runnerId = input.runnerId || job.runnerId || "mac-local";
  job.logTail = logTail || null;
  job.error = input.ok ? null : String(input.error || "El runner local informó error.");
  if (input.ok && input.result) {
    const resultPath = `app/data/price-ingest/local-game/${job.id}.json`;
    const resultWritten = await writeWorkerFile(resultPath, Buffer.from(`${JSON.stringify(input.result, null, 2)}\n`, "utf8"));
    if ("error" in resultWritten) return resultWritten;
    job.resultPath = resultPath;
    job.resultSummary = summarizeResult(input.result);
  }
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  return { ok: true, job };
}

export async function importLocalGameRunnerJob(jobId: string): Promise<{ ok: true; job: LocalGameRunnerJob } | { error: string }> {
  const queue = queueWithRecentJobs((await readQueueFromWorker()) ?? readQueueFromDisk());
  const job = queue.jobs.find((item) => item.id === jobId);
  if (!job) return { error: "Job local no encontrado." };
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
