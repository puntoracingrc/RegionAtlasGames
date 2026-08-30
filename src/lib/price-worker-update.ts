import path from "path";

export const PC_WORKER_UPDATE_MODE = "git_fast_forward_main_v1";

export type PcWorkerUpdateAction = "update_only" | "automatic_sources" | "ps4_pilot";

export type PcWorkerHealth = {
  available: boolean;
  checkedAt: string | null;
  runnerId: string | null;
  hostname: string | null;
  git: {
    ok: boolean;
    commitSha: string | null;
    branch: string | null;
    clean: boolean | null;
    updateCapability: string | null;
    error: string | null;
  };
  todoConsolasWeekly: {
    enabled: boolean | null;
    platforms: string | null;
    source: string | null;
  };
};

export type PcWorkerUpdateStatus = {
  available: boolean;
  ok: boolean | null;
  status: string;
  requestId: string | null;
  targetSha: string | null;
  beforeSha: string | null;
  afterSha: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type PcWorkerUpdateOverview = {
  deploymentSha: string | null;
  deploymentEnvironment: string | null;
  deploymentRef: string | null;
  queueAvailable: boolean;
  queueBlockReason: string | null;
  health: PcWorkerHealth;
  update: PcWorkerUpdateStatus;
};

type WorkerSftpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteDir: string;
  protocol: string;
};

type WorkerSftpEnv = Record<string, string | undefined>;

const SHA_RE = /^[0-9a-f]{40}$/;
const DEFAULT_PUBLIC_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker";

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function cleanSha(value: unknown): string | null {
  const clean = cleanText(value, 40)?.toLowerCase() ?? null;
  return clean && SHA_RE.test(clean) ? clean : null;
}

export function resolvePcWorkerDeploymentSha(
  value = process.env.VERCEL_GIT_COMMIT_SHA,
): string | null {
  return cleanSha(value);
}

export function isPcWorkerUpdateAction(value: unknown): value is PcWorkerUpdateAction {
  return value === "update_only" || value === "automatic_sources" || value === "ps4_pilot";
}

function deploymentQueueReadiness(): { available: boolean; reason: string | null } {
  const environment = process.env.VERCEL_ENV?.trim().toLowerCase();
  const ref = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  if (environment !== "production") {
    return { available: false, reason: "Solo se puede actualizar el PC desde producción." };
  }
  if (ref && ref !== "main") {
    return { available: false, reason: "El deployment de producción no corresponde a main." };
  }
  if (!resolvePcWorkerDeploymentSha()) {
    return { available: false, reason: "Vercel no informa del commit desplegado." };
  }
  return { available: true, reason: null };
}

function publicBaseUrl(): string {
  const covers = process.env.NEXT_PUBLIC_COVERS_BASE_URL || "https://www.puntoracing.net/MEDIAREGIONATLAS/covers";
  return (process.env.PRICE_WORKER_PUBLIC_URL || covers.replace(/\/covers\/?$/i, "/price-worker") || DEFAULT_PUBLIC_URL)
    .replace(/\/$/, "");
}

function validPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

export function resolveWorkerSftpConfig(env: WorkerSftpEnv = process.env): WorkerSftpConfig | null {
  const coversPort = validPort(env.COVERS_FTP_PORT, 22);
  const connections = [
    {
      host: env.PRICE_WORKER_SFTP_HOST?.trim(),
      username: env.PRICE_WORKER_SFTP_USER?.trim(),
      password: env.PRICE_WORKER_SFTP_PASSWORD?.trim(),
      port: validPort(env.PRICE_WORKER_SFTP_PORT, 22),
      protocol: "sftp",
    },
    {
      host: env.COVERS_FTP_HOST?.trim(),
      username: env.COVERS_FTP_USER?.trim(),
      password: env.COVERS_FTP_PASSWORD?.trim(),
      port: coversPort,
      protocol: env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (coversPort === 22 ? "sftp" : "ftp"),
    },
    {
      host: env.PRICE_WORKER_SSH_HOST?.trim(),
      username: env.PRICE_WORKER_SSH_USER?.trim(),
      password: env.PRICE_WORKER_SSH_PASSWORD?.trim(),
      port: validPort(env.PRICE_WORKER_SSH_PORT, 22),
      protocol: "sftp",
    },
  ];
  const selected = connections.find(
    (candidate) => candidate.host && candidate.username && candidate.password,
  );
  if (!selected?.host || !selected.username || !selected.password) return null;
  const coversRoot = (env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  const remoteBase = /\/covers$/i.test(coversRoot) ? coversRoot.replace(/\/covers$/i, "") : coversRoot;
  return {
    host: selected.host,
    username: selected.username,
    password: selected.password,
    port: selected.port,
    remoteDir: (env.PRICE_WORKER_REMOTE_DIR || `${remoteBase}/price-worker`).replace(/^\/+|\/+$/g, ""),
    protocol: selected.protocol,
  };
}

function weeklyControlFor(action: PcWorkerUpdateAction) {
  if (action !== "automatic_sources" && action !== "ps4_pilot") return undefined;
  return {
    enabled: true,
    platforms: action === "automatic_sources" ? ["ps4", "ps5", "switch2"] : ["ps4"],
    pagesPerRun: 1,
    delaySeconds: 8,
    jitterSeconds: 3,
    backoffHours: 24,
    intervalDays: 7,
  };
}

export function buildPcWorkerUpdateRequest(
  targetSha: string,
  action: PcWorkerUpdateAction,
  options: { now?: Date; suffix?: string } = {},
) {
  const cleanTarget = cleanSha(targetSha);
  if (!cleanTarget) throw new Error("El deployment no expone un commit SHA valido.");
  const now = options.now ?? new Date();
  const suffix = (options.suffix || Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, "").slice(0, 12) || "request";
  const requestId = `worker-update-${now.getTime()}-${suffix}`;
  return {
    schemaVersion: 1,
    mode: PC_WORKER_UPDATE_MODE,
    requestId,
    targetSha: cleanTarget,
    requestedAt: now.toISOString(),
    repository: "puntoracingrc/RegionAtlasGames",
    branch: "main",
    weeklyControl: weeklyControlFor(action),
  };
}

async function writeWorkerJsonFiles(files: Array<{ remote: string; value: Record<string, unknown> }>): Promise<void> {
  const config = resolveWorkerSftpConfig();
  if (!config) throw new Error("SFTP del worker no configurado.");
  if (config.protocol !== "sftp") throw new Error("La actualizacion segura del worker requiere SFTP.");
  const mod = (await import("ssh2-sftp-client")) as unknown as {
    default: new () => {
      connect(config: Record<string, unknown>): Promise<void>;
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

export async function queuePcWorkerUpdate(action: PcWorkerUpdateAction) {
  const readiness = deploymentQueueReadiness();
  if (!readiness.available) throw new Error(readiness.reason || "Actualización no disponible.");
  const targetSha = resolvePcWorkerDeploymentSha();
  if (!targetSha) throw new Error("Vercel no informa del commit desplegado; no se crea la solicitud.");
  const request = buildPcWorkerUpdateRequest(targetSha, action);
  const queuedStatus = {
    ok: true,
    status: "queued",
    requestId: request.requestId,
    targetSha: request.targetSha,
    requestedAt: request.requestedAt,
    weeklyControl: request.weeklyControl,
  };
  await writeWorkerJsonFiles([
    { remote: "cron/pc-worker-update-status.json", value: queuedStatus },
    // La solicitud es el punto de commit: se publica al final para evitar que el
    // worker termine antes de que el estado "queued" quede escrito.
    { remote: `jobs/worker-update-requests/${request.requestId}.json`, value: request },
  ]);
  return queuedStatus;
}

async function fetchWorkerJson(relativePath: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${publicBaseUrl()}/${relativePath.replace(/^\//, "")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 32 * 1024) return null;
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function normalizePcWorkerHealth(value: Record<string, unknown> | null): PcWorkerHealth {
  const git = value?.git && typeof value.git === "object" ? value.git as Record<string, unknown> : {};
  const weekly = value?.todoConsolasWeekly && typeof value.todoConsolasWeekly === "object"
    ? value.todoConsolasWeekly as Record<string, unknown>
    : {};
  return {
    available: Boolean(value),
    checkedAt: cleanText(value?.checkedAt, 80),
    runnerId: cleanText(value?.runnerId, 120),
    hostname: cleanText(value?.hostname, 120),
    git: {
      ok: git.ok === true,
      commitSha: cleanSha(git.commitSha),
      branch: cleanText(git.branch, 80),
      clean: typeof git.clean === "boolean" ? git.clean : null,
      updateCapability: cleanText(git.updateCapability, 120),
      error: cleanText(git.error),
    },
    todoConsolasWeekly: {
      enabled: typeof weekly.enabled === "boolean" ? weekly.enabled : null,
      platforms: cleanText(weekly.platforms, 300),
      source: cleanText(weekly.source, 80),
    },
  };
}

export function normalizePcWorkerUpdateStatus(value: Record<string, unknown> | null): PcWorkerUpdateStatus {
  return {
    available: Boolean(value),
    ok: typeof value?.ok === "boolean" ? value.ok : null,
    status: cleanText(value?.status, 80) || "not_reported",
    requestId: cleanText(value?.requestId, 160),
    targetSha: cleanSha(value?.targetSha),
    beforeSha: cleanSha(value?.beforeSha),
    afterSha: cleanSha(value?.afterSha),
    requestedAt: cleanText(value?.requestedAt, 80),
    startedAt: cleanText(value?.startedAt, 80),
    finishedAt: cleanText(value?.finishedAt, 80),
    error: cleanText(value?.error),
  };
}

export async function getPcWorkerUpdateOverview(): Promise<PcWorkerUpdateOverview> {
  const readiness = deploymentQueueReadiness();
  const [health, update] = await Promise.all([
    fetchWorkerJson("cron/pc-worker-health.json"),
    fetchWorkerJson("cron/pc-worker-update-status.json"),
  ]);
  return {
    deploymentSha: resolvePcWorkerDeploymentSha(),
    deploymentEnvironment: cleanText(process.env.VERCEL_ENV, 40),
    deploymentRef: cleanText(process.env.VERCEL_GIT_COMMIT_REF, 120),
    queueAvailable: readiness.available,
    queueBlockReason: readiness.reason,
    health: normalizePcWorkerHealth(health),
    update: normalizePcWorkerUpdateStatus(update),
  };
}
