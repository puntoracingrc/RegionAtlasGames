import { spawn } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { appDataDir } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { getSiteUrl } from "./site-url";

export type AdminPriceJobMeta = {
  jobId: string;
  status: "running" | "done" | "error";
  catalogId?: string;
  platformSlug?: string;
  region?: string;
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
  platformSlug?: string;
  region?: string;
  targets?: AdminPriceCollectTarget[];
  estimateMinutes?: number;
  advanceRotation?: boolean;
};

type WorkerConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteDir: string;
  publicBaseUrl: string;
};

const DEFAULT_PRICE_WORKER_PUBLIC_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker";

function resolvePriceWorkerPublicBaseUrl(): string {
  const coversUrl = process.env.NEXT_PUBLIC_COVERS_BASE_URL || "https://www.puntoracing.net/MEDIAREGIONATLAS/covers";
  return (process.env.PRICE_WORKER_PUBLIC_URL || coversUrl.replace(/\/covers\/?$/, "/price-worker") || DEFAULT_PRICE_WORKER_PUBLIC_URL).replace(/\/$/, "");
}

function remoteWorkerConfig(): WorkerConfig | null {
  const host = process.env.PRICE_WORKER_SSH_HOST || process.env.COVERS_FTP_HOST;
  const username = process.env.PRICE_WORKER_SSH_USER || process.env.COVERS_FTP_USER;
  const password = process.env.PRICE_WORKER_SSH_PASSWORD || process.env.COVERS_FTP_PASSWORD;
  const coversRoot = process.env.COVERS_FTP_REMOTE_ROOT || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers";
  const remoteBase = coversRoot.replace(/\/covers\/?$/, "");
  const publicBaseUrl = resolvePriceWorkerPublicBaseUrl();
  if (!host || !username || !password || !publicBaseUrl) return null;
  return {
    host,
    port: Number(process.env.PRICE_WORKER_SSH_PORT || process.env.COVERS_FTP_PORT || 22),
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

function inferRemoteJobErrorFromLog(meta: AdminPriceJobMeta, logTail?: string): AdminPriceJobMeta {
  if (meta.status !== "running" || !logTail) return meta;
  const notFound = logTail.match(/(?:^|\n)\s*Juego no encontrado:\s*([^\n]+)/i);
  if (notFound) {
    return {
      ...meta,
      status: "error",
      finishedAt: meta.finishedAt ?? new Date().toISOString(),
      error: `Juego no encontrado en el worker: ${notFound[1].trim()}`,
    };
  }
  const fatal = logTail.match(/(?:^|\n)\s*(Ninguna fuente produjo datos\.|Traceback .*|ModuleNotFoundError:[^\n]+|RuntimeError:[^\n]+)/i);
  if (fatal) {
    return {
      ...meta,
      status: "error",
      finishedAt: meta.finishedAt ?? new Date().toISOString(),
      error: fatal[1].trim(),
    };
  }
  return meta;
}

export function isAdminPriceCollectAvailable(): boolean {
  return Boolean(remoteWorkerConfig() || process.env.ENABLE_VERCEL_PRICE_JOBS === "1" || !process.env.VERCEL);
}

export function adminPriceCollectUnavailableReason(): string {
  return "La recolección manual necesita un worker de precios con Python. En Vercel no se puede ejecutar directamente desde el botón del panel.";
}

function jobPaths(jobId: string) {
  return {
    log: path.join(JOBS_DIR, `${jobId}.log`),
    status: path.join(JOBS_DIR, `${jobId}.json`),
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
      const live = await readAdminPriceJob(job.jobId);
      return live ? { ...job, ...live } : job;
    }),
  );
  return refreshed.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, limit);
}

function validateInput(input: PriceJobStartInput): { targets: AdminPriceCollectTarget[] } | { error: string } {
  if (!isAdminPriceCollectAvailable()) {
    return { error: adminPriceCollectUnavailableReason() };
  }

  const targets = (input.targets ?? []).filter((target) => target.platformSlug.trim());
  if (!input.catalogId && !input.platformSlug && targets.length === 0) {
    return { error: "Indica catalogId, platformSlug o targets." };
  }
  const targetKinds = [Boolean(input.catalogId), Boolean(input.platformSlug), targets.length > 0].filter(Boolean).length;
  if (targetKinds > 1) {
    return { error: "Solo un tipo de objetivo a la vez." };
  }
  return { targets };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function execSsh(config: WorkerConfig, command: string): Promise<string> {
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
  const mod = (await import("ssh2")) as unknown as { Client: new () => SshConnection };
  const conn = new mod.Client();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("Timeout conectando con el worker de precios."));
    }, 20000);
    conn
      .on("ready", () => {
        conn.exec(command, (error, stream) => {
          if (error) {
            clearTimeout(timer);
            conn.end();
            reject(error);
            return;
          }
          let stdout = "";
          let stderr = "";
          stream
            .on("close", (code: number) => {
              clearTimeout(timer);
              conn.end();
              if (code === 0) resolve(stdout);
              else reject(new Error(stderr.trim() || stdout.trim() || `Worker remoto terminó con código ${code}.`));
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            });
          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      })
      .connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 15000,
      });
  });
}

async function startRemotePriceCollectJob(input: PriceJobStartInput, targets: AdminPriceCollectTarget[]): Promise<{ jobId: string } | { error: string }> {
  const config = remoteWorkerConfig();
  if (!config) return { error: adminPriceCollectUnavailableReason() };
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const remoteDir = shellQuote(config.remoteDir);
  const statusFile = `"$(pwd)/jobs/${jobId}.json"`;
  const pidFile = `"$(pwd)/jobs/${jobId}.pid"`;
  const args = ["app/scripts/admin_price_collect.py", "--status-file", statusFile];
  if (input.catalogId) args.push("--catalog-id", shellQuote(input.catalogId));
  else if (input.platformSlug) {
    args.push("--platform", shellQuote(input.platformSlug));
    if (input.region?.trim()) args.push("--region", shellQuote(input.region.trim()));
    if (input.advanceRotation) args.push("--advance-rotation");
  } else {
    args.push("--targets-json", shellQuote(JSON.stringify(targets)));
  }

  const callbackSecret = process.env.CRON_SECRET?.trim();
  const callbackUrl =
    input.catalogId && callbackSecret
      ? `${getSiteUrl()}/api/cron/price-job-apply?jobId=${encodeURIComponent(jobId)}`
      : null;
  const runCommand = callbackUrl
    ? [
        `${args.join(" ")}`,
        "code=$?",
        `if [ "$code" -eq 0 ]; then curl -fsS -X POST -H ${shellQuote(`Authorization: Bearer ${callbackSecret}`)} ${shellQuote(callbackUrl)} || true; fi`,
        "exit $code",
      ].join("; ")
    : args.join(" ");

  const workerEnv = [
    "PYTHONUNBUFFERED=1",
    `PRICE_COLLECT_TRIGGER=${input.advanceRotation ? "automatic" : "manual"}`,
    input.advanceRotation ? "PRICE_WORKER_DAILY=1" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const command = [
    "set -e",
    `cd "$HOME"/${remoteDir}`,
    "mkdir -p jobs logs",
    `nohup sh -c ${shellQuote(`${workerEnv} app/venv/bin/python -u ${runCommand}`)} > logs/${jobId}.log 2>&1 &`,
    `echo $! > ${pidFile}`,
    `echo ${shellQuote(jobId)}`,
  ].join("\n");

  try {
    await execSsh(config, command);
    await rememberAdminPriceJob({
      jobId,
      status: "running",
      catalogId: input.catalogId,
      platformSlug: input.platformSlug,
      region: input.region,
      targets: targets.length > 0 ? targets : undefined,
      estimateMinutes: input.estimateMinutes,
      trigger: input.advanceRotation ? "automatic" : "manual",
      startedAt,
    });
    return { jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar el worker remoto.";
    if (/All configured authentication methods failed|authentication/i.test(message)) {
      return {
        error: `No se pudo autenticar con el worker de precios (${config.username}@${config.host}). Revisa PRICE_WORKER_SSH_* / COVERS_FTP_* en Vercel.`,
      };
    }
    return { error: message };
  }
}

export async function startAdminPriceCollectJob(input: PriceJobStartInput): Promise<{ jobId: string } | { error: string }> {
  const validation = validateInput(input);
  if ("error" in validation) return validation;
  const { targets } = validation;

  if (shouldUseRemoteWorker()) {
    return startRemotePriceCollectJob(input, targets);
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
    platformSlug: input.platformSlug,
    region: input.region,
    targets: targets.length > 0 ? targets : undefined,
    estimateMinutes: input.estimateMinutes,
    trigger: input.advanceRotation ? "automatic" : "manual",
    startedAt,
  } satisfies AdminPriceJobMeta;
  writeFileSync(
    paths.status,
    JSON.stringify(initialMeta, null, 2),
  );
  await rememberAdminPriceJob(initialMeta);

  const logFd = openSync(paths.log, "a");
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
  const remoteDir = shellQuote(config.remoteDir);
  const stoppedAt = new Date().toISOString();
  const statusJson = JSON.stringify({
    ...job,
    status: "error",
    stopRequestedAt: stoppedAt,
    finishedAt: stoppedAt,
    error: "Cancelado manualmente desde el admin.",
  });
  const command = [
    "set +e",
    `cd "$HOME"/${remoteDir}`,
    `if [ -f jobs/${shellQuote(job.jobId)}.pid ]; then kill -TERM "$(cat jobs/${shellQuote(job.jobId)}.pid)" 2>/dev/null || true; fi`,
    `pkill -TERM -f ${shellQuote(job.jobId)} 2>/dev/null || true`,
    `python3 - <<'PY'\nimport json, pathlib\npath = pathlib.Path(${JSON.stringify(`jobs/${job.jobId}.json`)})\npath.parent.mkdir(parents=True, exist_ok=True)\npath.write_text(${JSON.stringify(statusJson)} + "\\n", encoding="utf-8")\nPY`,
  ].join("\n");
  try {
    await execSsh(config, command);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo parar el job remoto." };
  }
  return markAdminPriceJob({
    ...job,
    status: "error",
    stopRequestedAt: stoppedAt,
    finishedAt: stoppedAt,
    error: "Cancelado manualmente desde el admin.",
  });
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
    const statusRes = await fetch(`${config.publicBaseUrl}/jobs/${encodeURIComponent(jobId)}.json`, { cache: "no-store" });
    if (!statusRes.ok) return null;
    const meta = (await statusRes.json()) as AdminPriceJobMeta;
    meta.jobId = meta.jobId || jobId;
    const logRes = await fetch(`${config.publicBaseUrl}/logs/${encodeURIComponent(jobId)}.log`, { cache: "no-store" }).catch(() => null);
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
  if (!existsSync(paths.status)) return null;

  try {
    const meta = JSON.parse(readFileSync(paths.status, "utf8")) as AdminPriceJobMeta;
    if (existsSync(paths.log)) {
      const log = readFileSync(paths.log, "utf8");
      meta.logTail = log.slice(-80000);
    }
    return inferRemoteJobErrorFromLog(meta, meta.logTail);
  } catch {
    return null;
  }
}
