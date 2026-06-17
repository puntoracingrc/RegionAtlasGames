import { spawn } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

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
};

export type AdminPriceCollectTarget = {
  platformSlug: string;
  region?: string;
};

const JOBS_DIR =
  process.env.ADMIN_PRICE_JOBS_DIR ??
  (process.env.VERCEL
    ? path.join(os.tmpdir(), "region-atlas-price-jobs")
    : path.join(process.cwd(), "data", "admin", "price-jobs"));

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

function remoteWorkerConfig(): WorkerConfig | null {
  const host = process.env.PRICE_WORKER_SSH_HOST || process.env.COVERS_FTP_HOST;
  const username = process.env.PRICE_WORKER_SSH_USER || process.env.COVERS_FTP_USER;
  const password = process.env.PRICE_WORKER_SSH_PASSWORD || process.env.COVERS_FTP_PASSWORD;
  const coversRoot = process.env.COVERS_FTP_REMOTE_ROOT || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers";
  const remoteBase = coversRoot.replace(/\/covers\/?$/, "");
  const coversUrl = process.env.NEXT_PUBLIC_COVERS_BASE_URL || "https://www.puntoracing.net/MEDIAREGIONATLAS/covers";
  const publicBaseUrl = (process.env.PRICE_WORKER_PUBLIC_URL || coversUrl.replace(/\/covers\/?$/, "/price-worker")).replace(/\/$/, "");
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
  return remoteWorkerConfig()?.publicBaseUrl ?? null;
}

function useRemoteWorker(): boolean {
  return Boolean(remoteWorkerConfig() && (process.env.VERCEL || process.env.PRICE_WORKER_FORCE_REMOTE === "1"));
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
  const mod = (await import("ssh2")) as unknown as { Client: new () => any };
  const conn = new mod.Client();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("Timeout conectando con el worker de precios."));
    }, 20000);
    conn
      .on("ready", () => {
        conn.exec(command, (error: Error | undefined, stream: any) => {
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
  const remoteDir = shellQuote(config.remoteDir);
  const statusFile = `"$(pwd)/jobs/${jobId}.json"`;
  const args = ["app/scripts/admin_price_collect.py", "--status-file", statusFile];
  if (input.catalogId) args.push("--catalog-id", shellQuote(input.catalogId));
  else if (input.platformSlug) {
    args.push("--platform", shellQuote(input.platformSlug));
    if (input.region?.trim()) args.push("--region", shellQuote(input.region.trim()));
    if (input.advanceRotation) args.push("--advance-rotation");
  } else {
    args.push("--targets-json", shellQuote(JSON.stringify(targets)));
  }

  const command = [
    "set -e",
    `cd "$HOME"/${remoteDir}`,
    "mkdir -p jobs logs",
    `nohup app/venv/bin/python ${args.join(" ")} > logs/${jobId}.log 2>&1 &`,
    `echo ${shellQuote(jobId)}`,
  ].join("\n");

  try {
    await execSsh(config, command);
    return { jobId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo iniciar el worker remoto." };
  }
}

export async function startAdminPriceCollectJob(input: PriceJobStartInput): Promise<{ jobId: string } | { error: string }> {
  const validation = validateInput(input);
  if ("error" in validation) return validation;
  const { targets } = validation;

  if (useRemoteWorker()) {
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
  writeFileSync(
    paths.status,
    JSON.stringify(
      {
        jobId,
        status: "running",
        catalogId: input.catalogId,
        platformSlug: input.platformSlug,
        region: input.region,
        targets: targets.length > 0 ? targets : undefined,
        estimateMinutes: input.estimateMinutes,
        startedAt,
      } satisfies AdminPriceJobMeta,
      null,
      2,
    ),
  );

  const logFd = openSync(paths.log, "a");
  const child = spawn("python3", args, {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.on("error", (error) => {
    try {
      writeFileSync(
        paths.status,
        JSON.stringify(
          {
            jobId,
            status: "error",
            catalogId: input.catalogId,
            platformSlug: input.platformSlug,
            region: input.region,
            targets: targets.length > 0 ? targets : undefined,
            estimateMinutes: input.estimateMinutes,
            startedAt,
            finishedAt: new Date().toISOString(),
            error:
              error.message.includes("ENOENT")
                ? "No se pudo iniciar Python en este entorno. La recolección necesita ejecutarse en un worker/servidor, no directamente en esta función web."
                : error.message,
          } satisfies AdminPriceJobMeta,
          null,
          2,
        ),
      );
    } catch {
      // noop
    }
    try {
      closeSync(logFd);
    } catch {
      // noop
    }
  });
  child.unref();

  return { jobId };
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
      meta.logTail = log.slice(-4000);
    }
    return meta;
  } catch {
    return null;
  }
}

export async function readAdminPriceJob(jobId: string): Promise<AdminPriceJobMeta | null> {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) return null;
  if (useRemoteWorker()) {
    return readRemotePriceJob(jobId);
  }
  const paths = jobPaths(jobId);
  if (!existsSync(paths.status)) return null;

  try {
    const meta = JSON.parse(readFileSync(paths.status, "utf8")) as AdminPriceJobMeta;
    if (existsSync(paths.log)) {
      const log = readFileSync(paths.log, "utf8");
      meta.logTail = log.slice(-4000);
    }
    return meta;
  } catch {
    return null;
  }
}
