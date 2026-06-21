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
  status: LocalGameRunnerStatus;
  source: "game-es";
  platformSlug: "ps4" | "ps5";
  offerType: LocalGameRunnerOfferType;
  limit: number;
  maxPages: number;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string | null;
  finishedAt?: string | null;
  runnerId?: string | null;
  resultPath?: string | null;
  importedAt?: string | null;
  importStatus?: "not_imported" | "imported" | "error" | null;
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
  maxPages?: number;
};

function emptyQueue(): LocalGameRunnerQueue {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), jobs: [] };
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
  return {
    id: String(raw.id),
    status,
    source: "game-es",
    platformSlug,
    offerType,
    limit: Math.max(1, Math.min(60, Number(raw.limit) || 20)),
    maxPages: Math.max(1, Math.min(2, Number(raw.maxPages) || 1)),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    claimedAt: raw.claimedAt ?? null,
    finishedAt: raw.finishedAt ?? null,
    runnerId: raw.runnerId ?? null,
    resultPath: raw.resultPath ?? null,
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
  const host = process.env.PRICE_WORKER_SSH_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim();
  const username = process.env.PRICE_WORKER_SSH_USER?.trim() || process.env.COVERS_FTP_USER?.trim();
  const password = process.env.PRICE_WORKER_SSH_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SSH_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim();
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function execWorkerCommand(command: string): Promise<{ ok: true; output: string } | { error: string; output?: string }> {
  const config = workerSftpConfig();
  if (!config) return { error: "SFTP/SSH del worker no configurado." };
  type SshStream = {
    on(event: "close", listener: (code: number) => void): SshStream;
    on(event: "data", listener: (data: Buffer) => void): SshStream;
    stderr: { on(event: "data", listener: (data: Buffer) => void): void };
  };
  type SshConnection = {
    on(event: "ready", listener: () => void): SshConnection;
    on(event: "error", listener: (error: Error) => void): SshConnection;
    exec(command: string, callback: (error: Error | undefined, stream: SshStream) => void): void;
    connect(config: Record<string, unknown>): void;
    end(): void;
  };
  const mod = (await import("ssh2")) as unknown as {
    Client: new () => SshConnection;
  };
  const conn = new mod.Client();
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      conn.end();
      resolve({ error: "Timeout ejecutando importación en worker." });
    }, 120_000);
    conn
      .on("ready", () => {
        conn.exec(command, (error, stream) => {
          if (error) {
            clearTimeout(timer);
            conn.end();
            resolve({ error: error.message });
            return;
          }
          let output = "";
          stream
            .on("data", (data) => {
              output += data.toString();
            })
            .on("close", (code) => {
              clearTimeout(timer);
              conn.end();
              if (code === 0) resolve({ ok: true, output });
              else resolve({ error: `El importador terminó con código ${code}.`, output });
            });
          stream.stderr.on("data", (data) => {
            output += data.toString();
          });
        });
      })
      .on("error", (error) => {
        clearTimeout(timer);
        resolve({ error: error.message });
      })
      .connect({ ...config, readyTimeout: 60_000 });
  });
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
  const maxPages = Math.max(1, Math.min(2, Number(input.maxPages) || 1));
  const now = new Date().toISOString();
  const job: LocalGameRunnerJob = {
    id: `local-game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    source: "game-es",
    platformSlug,
    offerType,
    limit,
    maxPages,
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

  const inputPath = job.resultPath.replace(/^app\//, "");
  const command = [
    `cd ${shellQuote(path.posix.join(priceWorkerRemoteRoot(), "app"))}`,
    "&&",
    "python3",
    "scripts/sync_es_prices.py",
    "--platform",
    shellQuote(job.platformSlug),
    "--input",
    shellQuote(inputPath),
    "--no-advance-rotation",
    "--no-vision",
  ].join(" ");
  const result = await execWorkerCommand(command);
  const now = new Date().toISOString();
  job.updatedAt = now;
  job.importedAt = now;
  job.importLogTail = String(result.output ?? "").slice(-12000) || null;
  if ("error" in result) {
    job.importStatus = "error";
    job.importError = result.error;
  } else {
    job.importStatus = "imported";
    job.importError = null;
  }
  const written = await writeQueue(queue);
  if ("error" in written) return written;
  if ("error" in result) return { error: result.error };
  return { ok: true, job };
}
