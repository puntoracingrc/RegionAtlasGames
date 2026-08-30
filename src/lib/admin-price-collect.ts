import { spawn } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { appDataDir } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";

export type AdminPriceJobMeta = {
  jobId: string;
  status: "running" | "done" | "error";
  catalogId?: string;
  catalogIds?: string[];
  resultCatalogIds?: string[];
  verifiedCatalogIds?: string[];
  platformSlug?: string;
  region?: string;
  source?: "wallapop";
  resultPath?: string;
  collectorStats?: Record<string, unknown>;
  reviewQueueItems?: number;
  targets?: AdminPriceCollectTarget[];
  completedTargets?: (AdminPriceCollectTarget & { exitCode?: number })[];
  failedTargets?: (AdminPriceCollectTarget & { error?: string; exitCode?: number })[];
  estimateMinutes?: number;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
  sources?: string[];
  logTail?: string;
  trigger?: "manual" | "automatic";
  autoApplied?: boolean;
  autoApplySummary?: string;
  autoApplyError?: string;
  pid?: number;
  stopRequestedAt?: string;
};

export type AdminPriceCollectTarget = {
  platformSlug: string;
  region?: string;
};

const JOBS_DIR =
  process.env.ADMIN_PRICE_JOBS_DIR ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "price-jobs")
    : path.join(process.cwd(), "data", "admin", "price-jobs"));
const JOBS_REGISTRY_FILE = path.join(JOBS_DIR, "index.json");
const JOBS_REGISTRY_BLOB_PATH = "region-atlas/admin/price-jobs/index.json";

type AdminPriceJobRegistry = {
  version: number;
  updatedAt: string;
  jobs: AdminPriceJobMeta[];
};

type PriceJobStartInput = {
  catalogId?: string;
  catalogIds?: string[];
  platformSlug?: string;
  region?: string;
  targets?: AdminPriceCollectTarget[];
  estimateMinutes?: number;
  advanceRotation?: boolean;
  source?: "wallapop";
};

type WorkerConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteDir: string;
  publicBaseUrl: string;
};

type RemotePriceCollectRequest = {
  jobId: string;
  status: "pending";
  mode: "catalog" | "platform" | "targets" | "wallapop_batch";
  catalogId?: string;
  catalogIds?: string[];
  platformSlug?: string;
  region?: string;
  targets?: AdminPriceCollectTarget[];
  source?: "wallapop";
  estimateMinutes?: number;
  advanceRotation: boolean;
  trigger: "manual" | "automatic";
  startedAt: string;
  updatedAt: string;
  runner: "sftp_queue";
};

const DEFAULT_PRICE_WORKER_PUBLIC_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker";

function resolvePriceWorkerPublicBaseUrl(): string {
  const coversUrl = process.env.NEXT_PUBLIC_COVERS_BASE_URL || "https://www.puntoracing.net/MEDIAREGIONATLAS/covers";
  return (process.env.PRICE_WORKER_PUBLIC_URL || coversUrl.replace(/\/covers\/?$/, "/price-worker") || DEFAULT_PRICE_WORKER_PUBLIC_URL).replace(/\/$/, "");
}

function remoteWorkerConfig(): WorkerConfig | null {
  const host = process.env.PRICE_WORKER_SFTP_HOST || process.env.COVERS_FTP_HOST || process.env.PRICE_WORKER_SSH_HOST;
  const username = process.env.PRICE_WORKER_SFTP_USER || process.env.COVERS_FTP_USER || process.env.PRICE_WORKER_SSH_USER;
  const password = process.env.PRICE_WORKER_SFTP_PASSWORD || process.env.COVERS_FTP_PASSWORD || process.env.PRICE_WORKER_SSH_PASSWORD;
  const coversRoot = process.env.COVERS_FTP_REMOTE_ROOT || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers";
  const remoteBase = coversRoot.replace(/\/covers\/?$/, "");
  const publicBaseUrl = resolvePriceWorkerPublicBaseUrl();
  if (!host || !username || !password || !publicBaseUrl) return null;
  return {
    host,
    port: Number(process.env.PRICE_WORKER_SFTP_PORT || process.env.COVERS_FTP_PORT || process.env.PRICE_WORKER_SSH_PORT || 22),
    username,
    password,
    remoteDir: process.env.PRICE_WORKER_REMOTE_DIR || `${remoteBase}/price-worker`,
    publicBaseUrl,
  };
}

export function priceWorkerPublicBaseUrl(): string | null {
  return resolvePriceWorkerPublicBaseUrl();
}

function shouldUseRemoteWorker(): boolean {
  return Boolean(remoteWorkerConfig() && (process.env.VERCEL || process.env.PRICE_WORKER_FORCE_REMOTE === "1"));
}

export function inferRemoteJobErrorFromLog(meta: AdminPriceJobMeta, logTail?: string): AdminPriceJobMeta {
  const normalizedLogTail = (logTail ?? meta.logTail)?.replace(/\r\n?/g, "\n");
  const normalizedMeta = normalizedLogTail === meta.logTail
    ? meta
    : {
        ...meta,
        ...(normalizedLogTail === undefined ? {} : { logTail: normalizedLogTail }),
      };

  if (normalizedMeta.status !== "running" || !normalizedLogTail) return normalizedMeta;
  const notFound = normalizedLogTail.match(/(?:^|\n)\s*Juego no encontrado:\s*([^\n]+)/i);
  if (notFound) {
    return {
      ...normalizedMeta,
      status: "error",
      error: `Juego no encontrado en el worker: ${notFound[1].trim()}`,
    };
  }
  const fatal = normalizedLogTail.match(/(?:^|\n)\s*(Ninguna fuente produjo datos\.|Traceback .*|ModuleNotFoundError:[^\n]+|RuntimeError:[^\n]+)/i);
  if (fatal) {
    return {
      ...normalizedMeta,
      status: "error",
      error: fatal[1].trim(),
    };
  }
  return normalizedMeta;
}

export function isAdminPriceCollectAvailable(): boolean {
  return Boolean(remoteWorkerConfig() || process.env.ENABLE_VERCEL_PRICE_JOBS === "1" || !process.env.VERCEL);
}

export function adminPriceCollectUnavailableReason(): string {
  return "La recolección manual necesita un worker de precios con Python. En Vercel no se puede ejecutar directamente desde el botón del panel.";
}

function jobPaths(jobId: string) {
  return {
    log: path.join(/* turbopackIgnore: true */ JOBS_DIR, `${jobId}.log`),
    status: path.join(/* turbopackIgnore: true */ JOBS_DIR, `${jobId}.json`),
  };
}

function shouldUseJobRegistryBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function emptyJobRegistry(): AdminPriceJobRegistry {
  return { version: 1, updatedAt: new Date().toISOString(), jobs: [] };
}

function parseJobRegistry(raw: string): AdminPriceJobRegistry {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminPriceJobRegistry>;
    const jobs = Array.isArray(parsed.jobs)
      ? parsed.jobs.filter((job): job is AdminPriceJobMeta =>
          Boolean(
            job &&
              typeof job.jobId === "string" &&
              typeof job.startedAt === "string" &&
              (job.status === "running" || job.status === "done" || job.status === "error"),
          ),
        )
      : [];
    return {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      jobs,
    };
  } catch {
    return emptyJobRegistry();
  }
}

function readJobRegistryFromDisk(): AdminPriceJobRegistry | null {
  try {
    if (!existsSync(JOBS_REGISTRY_FILE)) return null;
    return parseJobRegistry(readFileSync(JOBS_REGISTRY_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeJobRegistryToDisk(registry: AdminPriceJobRegistry): void {
  if (!existsSync(JOBS_DIR)) mkdirSync(JOBS_DIR, { recursive: true });
  writeFileSync(JOBS_REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf8");
}

async function readJobRegistryFromBlob(): Promise<AdminPriceJobRegistry | null> {
  if (!shouldUseJobRegistryBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(JOBS_REGISTRY_BLOB_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    return parseJobRegistry(await new Response(result.stream).text());
  } catch {
    return null;
  }
}

async function writeJobRegistryToBlob(registry: AdminPriceJobRegistry): Promise<void> {
  if (!shouldUseJobRegistryBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(JOBS_REGISTRY_BLOB_PATH, JSON.stringify(registry, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 30,
  });
}

async function readJobRegistry(): Promise<AdminPriceJobRegistry> {
  return (await readJobRegistryFromBlob()) ?? readJobRegistryFromDisk() ?? emptyJobRegistry();
}

async function writeJobRegistry(registry: AdminPriceJobRegistry): Promise<void> {
  const payload = { ...registry, updatedAt: new Date().toISOString() };
  try {
    writeJobRegistryToDisk(payload);
  } catch {}
  await writeJobRegistryToBlob(payload);
}

async function rememberAdminPriceJob(job: AdminPriceJobMeta): Promise<void> {
  const registry = await readJobRegistry();
  const existing = registry.jobs.filter((item) => item.jobId !== job.jobId);
  registry.jobs = [job, ...existing]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 50);
  await writeJobRegistry(registry);
}

async function markAdminPriceJob(job: AdminPriceJobMeta): Promise<AdminPriceJobMeta> {
  await rememberAdminPriceJob(job);
  try {
    const paths = jobPaths(job.jobId);
    if (!existsSync(JOBS_DIR)) mkdirSync(JOBS_DIR, { recursive: true });
    writeFileSync(paths.status, JSON.stringify(job, null, 2), "utf8");
  } catch {
    // noop
  }
  return job;
}

function readLocalPriceJobs(): AdminPriceJobMeta[] {
  if (!existsSync(JOBS_DIR)) return [];
  return readdirSync(JOBS_DIR)
    .filter((file) => file.endsWith(".json") && file !== "index.json")
    .map((file) => {
      try {
        const parsed = JSON.parse(readFileSync(path.join(JOBS_DIR, file), "utf8")) as AdminPriceJobMeta;
        return parsed?.jobId ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((job): job is AdminPriceJobMeta => Boolean(job?.jobId && job.startedAt));
}

export async function listAdminPriceJobs(limit = 20): Promise<AdminPriceJobMeta[]> {
  const registry = await readJobRegistry();
  const byId = new Map<string, AdminPriceJobMeta>();
  for (const job of [...registry.jobs, ...readLocalPriceJobs()]) {
    if (!job.jobId) continue;
    const existing = byId.get(job.jobId);
    if (!existing || Date.parse(job.startedAt) > Date.parse(existing.startedAt)) {
      byId.set(job.jobId, job);
    }
  }

  const jobs = [...byId.values()]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
  const refreshed = await Promise.all(
    jobs.map(async (job) => {
      if (job.status !== "running") return inferRemoteJobErrorFromLog(job, job.logTail);
      const live = await readAdminPriceJob(job.jobId);
      const merged = live ? { ...job, ...live } : job;
      return inferRemoteJobErrorFromLog(merged, merged.logTail);
    }),
  );
  return refreshed.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, limit);
}

function cleanCatalogIds(value: string[] | undefined): string[] | { error: string } {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value ?? []) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    if (id.length > 240 || /[\u0000-\u001f\u007f]/.test(id)) {
      return { error: `ID de catálogo no permitido: ${id}` };
    }
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > 20) return { error: "La tanda Wallapop admite como máximo 20 juegos." };
  return ids;
}

function validateInput(
  input: PriceJobStartInput,
): { targets: AdminPriceCollectTarget[]; catalogIds: string[] } | { error: string } {
  if (!isAdminPriceCollectAvailable()) {
    return { error: adminPriceCollectUnavailableReason() };
  }

  const targets = (input.targets ?? []).filter((target) => target.platformSlug.trim());
  const catalogIds = cleanCatalogIds(input.catalogIds);
  if ("error" in catalogIds) return catalogIds;
  if (!input.catalogId && catalogIds.length === 0 && !input.platformSlug && targets.length === 0) {
    return { error: "Indica catalogId, catalogIds, platformSlug o targets." };
  }
  const targetKinds = [
    Boolean(input.catalogId),
    catalogIds.length > 0,
    Boolean(input.platformSlug),
    targets.length > 0,
  ].filter(Boolean).length;
  if (targetKinds > 1) {
    return { error: "Solo un tipo de objetivo a la vez." };
  }
  if (catalogIds.length > 0 && input.source !== "wallapop") {
    return { error: "Las tandas de IDs solo están habilitadas para Wallapop." };
  }
  return { targets, catalogIds };
}

async function writeRemoteWorkerFile(config: WorkerConfig, remote: string, payload: Buffer): Promise<{ ok: true } | { error: string }> {
  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
      mkdir(remotePath: string, recursive?: boolean): Promise<void>;
      put(input: Buffer | string, remotePath: string): Promise<void>;
      end(): Promise<void>;
    };
  };
  const client = new mod.default();
  const remotePath = path.posix.join(config.remoteDir.replace(/^\/+|\/+$/g, ""), remote);
  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(path.posix.dirname(remotePath), true);
    await client.put(payload, remotePath);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo escribir en el worker por SFTP." };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function startRemotePriceCollectJob(
  input: PriceJobStartInput,
  targets: AdminPriceCollectTarget[],
  catalogIds: string[],
): Promise<{ jobId: string } | { error: string }> {
  const config = remoteWorkerConfig();
  if (!config) return { error: adminPriceCollectUnavailableReason() };
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const mode = input.catalogId
    ? "catalog"
    : catalogIds.length > 0
      ? "wallapop_batch"
      : input.platformSlug
        ? "platform"
        : "targets";
  const job = {
    jobId,
    status: "pending",
    mode,
    catalogId: input.catalogId,
    catalogIds: catalogIds.length > 0 ? catalogIds : undefined,
    platformSlug: input.platformSlug,
    region: input.region,
    targets: targets.length > 0 ? targets : undefined,
    source: input.source,
    estimateMinutes: input.estimateMinutes,
    advanceRotation: Boolean(input.advanceRotation),
    trigger: input.advanceRotation ? "automatic" : "manual",
    startedAt,
    updatedAt: startedAt,
    runner: "sftp_queue",
  } satisfies RemotePriceCollectRequest;
  const runningMeta = {
    jobId,
    status: "running",
    catalogId: input.catalogId,
    catalogIds: catalogIds.length > 0 ? catalogIds : undefined,
    platformSlug: input.platformSlug,
    region: input.region,
    targets: targets.length > 0 ? targets : undefined,
    source: input.source,
    estimateMinutes: input.estimateMinutes,
    trigger: input.advanceRotation ? "automatic" : "manual",
    startedAt,
    logTail: "Job enviado por SFTP. El cron del hosting lo recogerá sin usar SSH.",
  } satisfies AdminPriceJobMeta;

  const payload = Buffer.from(`${JSON.stringify(job, null, 2)}\n`, "utf8");
  const statusWritten = await writeRemoteWorkerFile(config, `jobs/${jobId}.json`, Buffer.from(`${JSON.stringify(runningMeta, null, 2)}\n`, "utf8"));
  if ("error" in statusWritten) return statusWritten;
  const requestWritten = await writeRemoteWorkerFile(config, `jobs/requests/${jobId}.json`, payload);
  if ("error" in requestWritten) return requestWritten;
  await rememberAdminPriceJob(runningMeta);
  return { jobId };
}

export async function startAdminPriceCollectJob(input: PriceJobStartInput): Promise<{ jobId: string } | { error: string }> {
  const validation = validateInput(input);
  if ("error" in validation) return validation;
  const { targets, catalogIds } = validation;

  if (shouldUseRemoteWorker()) {
    return startRemotePriceCollectJob(input, targets, catalogIds);
  }

  mkdirSync(JOBS_DIR, { recursive: true });
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paths = jobPaths(jobId);

  const args = [
    path.join(process.cwd(), "scripts", "admin_price_collect.py"),
    "--status-file",
    paths.status,
  ];
  if (input.catalogId) args.push("--catalog-id", input.catalogId);
  else if (catalogIds.length > 0) args.push("--catalog-ids-json", JSON.stringify(catalogIds));
  else if (input.platformSlug) {
    args.push("--platform", input.platformSlug);
    if (input.region?.trim()) args.push("--region", input.region.trim());
    if (input.advanceRotation) args.push("--advance-rotation");
  } else if (targets.length > 0) {
    args.push("--targets-json", JSON.stringify(targets));
  }

  const startedAt = new Date().toISOString();
  const initialMeta = {
    jobId,
    status: "running",
    catalogId: input.catalogId,
    catalogIds: catalogIds.length > 0 ? catalogIds : undefined,
    platformSlug: input.platformSlug,
    region: input.region,
    targets: targets.length > 0 ? targets : undefined,
    source: input.source,
    estimateMinutes: input.estimateMinutes,
    trigger: input.advanceRotation ? "automatic" : "manual",
    startedAt,
  } satisfies AdminPriceJobMeta;
  writeFileSync(
    paths.status,
    JSON.stringify(initialMeta, null, 2),
  );
  await rememberAdminPriceJob(initialMeta);

  const logFd = openSync(/* turbopackIgnore: true */ paths.log, "a");
  const child = spawn("python3", args, {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  const runningMeta = { ...initialMeta, pid: child.pid };
  writeFileSync(paths.status, JSON.stringify(runningMeta, null, 2));
  await rememberAdminPriceJob(runningMeta);
  child.on("error", (error) => {
    const errorMeta = {
      ...initialMeta,
      status: "error",
      finishedAt: new Date().toISOString(),
      error:
        error.message.includes("ENOENT")
          ? "No se pudo iniciar Python en este entorno. La recolección necesita ejecutarse en un worker/servidor, no directamente en esta función web."
          : error.message,
    } satisfies AdminPriceJobMeta;
    try {
      writeFileSync(paths.status, JSON.stringify(errorMeta, null, 2));
    } catch {
      // noop
    }
    void rememberAdminPriceJob(errorMeta);
    try {
      closeSync(logFd);
    } catch {
      // noop
    }
  });
  child.unref();

  return { jobId };
}

async function stopRemotePriceJob(job: AdminPriceJobMeta): Promise<AdminPriceJobMeta | { error: string }> {
  const config = remoteWorkerConfig();
  if (!config) return { error: adminPriceCollectUnavailableReason() };
  const stoppedAt = new Date().toISOString();
  const stoppedJob = {
    ...job,
    status: "error",
    stopRequestedAt: stoppedAt,
    finishedAt: stoppedAt,
    error: "Cancelación solicitada desde el admin. Sin SSH, el proceso activo no se puede matar al instante; el runner/cron verá esta marca.",
  } satisfies AdminPriceJobMeta;
  const cancelWritten = await writeRemoteWorkerFile(
    config,
    `jobs/${job.jobId}.cancel.json`,
    Buffer.from(`${JSON.stringify({ jobId: job.jobId, cancelledAt: stoppedAt }, null, 2)}\n`, "utf8"),
  );
  if ("error" in cancelWritten) return cancelWritten;
  const statusWritten = await writeRemoteWorkerFile(
    config,
    `jobs/${job.jobId}.json`,
    Buffer.from(`${JSON.stringify(stoppedJob, null, 2)}\n`, "utf8"),
  );
  if ("error" in statusWritten) return statusWritten;
  return markAdminPriceJob(stoppedJob);
}

async function stopLocalPriceJob(job: AdminPriceJobMeta): Promise<AdminPriceJobMeta | { error: string }> {
  if (job.pid) {
    try {
      process.kill(-job.pid, "SIGTERM");
    } catch {
      try {
        process.kill(job.pid, "SIGTERM");
      } catch {
        // El proceso puede haber terminado justo antes.
      }
    }
  }
  const stoppedAt = new Date().toISOString();
  return markAdminPriceJob({
    ...job,
    status: "error",
    stopRequestedAt: stoppedAt,
    finishedAt: stoppedAt,
    error: "Cancelado manualmente desde el admin.",
  });
}

export async function stopAdminPriceJob(jobId: string): Promise<AdminPriceJobMeta | { error: string }> {
  const job = await readAdminPriceJob(jobId);
  if (!job) return { error: "Job no encontrado." };
  if (job.status !== "running") return { error: "El job ya no está en marcha." };
  return shouldUseRemoteWorker() ? stopRemotePriceJob(job) : stopLocalPriceJob(job);
}

async function readRemotePriceJob(jobId: string): Promise<AdminPriceJobMeta | null> {
  const config = remoteWorkerConfig();
  if (!config) return null;
  try {
    const statusRes = await fetch(`${config.publicBaseUrl}/jobs/${encodeURIComponent(jobId)}.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!statusRes.ok) return null;
    const meta = (await statusRes.json()) as AdminPriceJobMeta;
    meta.jobId = meta.jobId || jobId;
    const logRes = await fetch(`${config.publicBaseUrl}/logs/${encodeURIComponent(jobId)}.log`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    }).catch(() => null);
    if (logRes?.ok) {
      const log = await logRes.text();
      meta.logTail = log.slice(-80000);
    }
    return inferRemoteJobErrorFromLog(meta, meta.logTail);
  } catch {
    return null;
  }
}

export async function readAdminPriceJob(jobId: string): Promise<AdminPriceJobMeta | null> {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) return null;
  if (shouldUseRemoteWorker()) {
    return readRemotePriceJob(jobId);
  }
  const paths = jobPaths(jobId);
  if (!existsSync(/* turbopackIgnore: true */ paths.status)) return null;

  try {
    const meta = JSON.parse(
      readFileSync(/* turbopackIgnore: true */ paths.status, "utf8"),
    ) as AdminPriceJobMeta;
    if (existsSync(/* turbopackIgnore: true */ paths.log)) {
      const log = readFileSync(/* turbopackIgnore: true */ paths.log, "utf8");
      meta.logTail = log.slice(-80000);
    }
    return inferRemoteJobErrorFromLog(meta, meta.logTail);
  } catch {
    return null;
  }
}
