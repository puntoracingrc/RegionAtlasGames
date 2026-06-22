import path from "path";
import { priceWorkerPublicBaseUrl } from "./admin-price-collect";

export type CatalogEntityAuditSummary = {
  totalIssues?: number;
  bySource?: Record<string, number>;
  bySeverity?: Record<string, number>;
  bySourceSeverityKind?: Record<string, number>;
};

export type CatalogEntityAuditIssue = {
  source?: string;
  severity?: string;
  kind?: string;
  recordId?: string;
  field?: string;
  value?: string;
  decodedValue?: string;
  title?: string;
  suggestedSlug?: string;
  suggestedId?: string;
  suggestedIdExists?: boolean;
};

export type CatalogEntityAuditReport = {
  schemaVersion?: number;
  summary?: CatalogEntityAuditSummary;
  examples?: CatalogEntityAuditIssue[];
  issues?: CatalogEntityAuditIssue[];
};

export type CatalogEntityAuditStatus = {
  jobId?: string;
  jobType?: string;
  status?: "pending" | "running" | "done" | "error" | string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  runnerId?: string;
  message?: string;
  error?: string;
  reportPath?: string;
  summary?: CatalogEntityAuditSummary;
  logTail?: string;
};

export type CatalogEntityMigrationPlanSummary = {
  target?: string;
  totalItems?: number;
  safeToApply?: number;
  conflicts?: number;
  totalChanges?: number;
};

export type CatalogEntityMigrationPlanItem = {
  oldId?: string;
  newId?: string;
  oldSlug?: string;
  newSlug?: string;
  platformSlug?: string;
  title?: string;
  region?: string;
  conflict?: boolean;
  safeToApply?: boolean;
  changeCount?: number;
};

export type CatalogEntityMigrationPlan = {
  schemaVersion?: number;
  generatedAt?: string;
  summary?: CatalogEntityMigrationPlanSummary;
  items?: CatalogEntityMigrationPlanItem[];
};

export type CatalogEntityAuditState = {
  status: CatalogEntityAuditStatus | null;
  report: CatalogEntityAuditReport | null;
  migrationPlanStatus: CatalogEntityAuditStatus | null;
  migrationPlan: CatalogEntityMigrationPlan | null;
  workerBaseUrl: string | null;
};

type SftpConfig = { host: string; port: number; username: string; password: string };

function priceWorkerRemoteRoot(): string {
  const explicit = process.env.PRICE_WORKER_REMOTE_DIR?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/price-worker");
  return `${coversRoot}/price-worker`;
}

function workerSftpConfig(): SftpConfig | null {
  const host = process.env.PRICE_WORKER_SFTP_HOST?.trim() || process.env.COVERS_FTP_HOST?.trim() || process.env.PRICE_WORKER_SSH_HOST?.trim();
  const username = process.env.PRICE_WORKER_SFTP_USER?.trim() || process.env.COVERS_FTP_USER?.trim() || process.env.PRICE_WORKER_SSH_USER?.trim();
  const password = process.env.PRICE_WORKER_SFTP_PASSWORD?.trim() || process.env.COVERS_FTP_PASSWORD?.trim() || process.env.PRICE_WORKER_SSH_PASSWORD?.trim();
  if (!host || !username || !password) return null;
  const portRaw = process.env.PRICE_WORKER_SFTP_PORT?.trim() || process.env.COVERS_FTP_PORT?.trim() || process.env.PRICE_WORKER_SSH_PORT?.trim();
  return { host, port: portRaw ? Number(portRaw) : 22, username, password };
}

async function fetchWorkerJson<T>(relativePath: string): Promise<T | null> {
  const base = priceWorkerPublicBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/${relativePath.replace(/^\/+/, "")}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
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
    return { error: error instanceof Error ? error.message : "No se pudo escribir en el worker por SFTP." };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function readCatalogEntityAuditState(): Promise<CatalogEntityAuditState> {
  const [status, report, migrationPlanStatus, migrationPlan] = await Promise.all([
    fetchWorkerJson<CatalogEntityAuditStatus>("app/data/admin/catalog-html-entity-audit-status.json"),
    fetchWorkerJson<CatalogEntityAuditReport>("app/data/admin/catalog-html-entity-audit.json"),
    fetchWorkerJson<CatalogEntityAuditStatus>("app/data/admin/catalog-entity-migration-plan-status.json"),
    fetchWorkerJson<CatalogEntityMigrationPlan>("app/data/admin/catalog-entity-migration-plan.json"),
  ]);
  return {
    status,
    report,
    migrationPlanStatus,
    migrationPlan,
    workerBaseUrl: priceWorkerPublicBaseUrl() || null,
  };
}

export async function startCatalogEntityAuditPcJob(): Promise<{ ok: true; jobId: string; message: string } | { error: string }> {
  const jobId = `catalog-audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const request = {
    jobId,
    jobType: "catalog_entity_audit",
    requestedAt: now,
    runner: "pc_sftp_worker",
  };
  const status: CatalogEntityAuditStatus = {
    jobId,
    jobType: "catalog_entity_audit",
    status: "pending",
    requestedAt: now,
    updatedAt: now,
    message: "Auditoría de catálogo enviada al PC worker.",
  };

  const fixedStatus = await writeWorkerFile(
    "app/data/admin/catalog-html-entity-audit-status.json",
    Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"),
  );
  if ("error" in fixedStatus) return fixedStatus;

  const jobStatus = await writeWorkerFile(`jobs/review-${jobId}.json`, Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"));
  if ("error" in jobStatus) return jobStatus;

  const requestWritten = await writeWorkerFile(`jobs/review-requests/${jobId}.json`, Buffer.from(`${JSON.stringify(request, null, 2)}\n`, "utf8"));
  if ("error" in requestWritten) return requestWritten;

  return { ok: true, jobId, message: "Auditoría enviada al PC. Actualiza estado cuando termine." };
}

export async function startCatalogEntityMigrationPlanPcJob(
  target: "percent27" | "html_amp" | "all" = "percent27",
): Promise<{ ok: true; jobId: string; message: string } | { error: string }> {
  const jobId = `catalog-plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const request = {
    jobId,
    jobType: "catalog_entity_migration_plan",
    target,
    requestedAt: now,
    runner: "pc_sftp_worker",
  };
  const status: CatalogEntityAuditStatus = {
    jobId,
    jobType: "catalog_entity_migration_plan",
    status: "pending",
    requestedAt: now,
    updatedAt: now,
    message: "Plan de limpieza enviado al PC worker.",
  };

  const fixedStatus = await writeWorkerFile(
    "app/data/admin/catalog-entity-migration-plan-status.json",
    Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"),
  );
  if ("error" in fixedStatus) return fixedStatus;

  const jobStatus = await writeWorkerFile(`jobs/review-${jobId}.json`, Buffer.from(`${JSON.stringify(status, null, 2)}\n`, "utf8"));
  if ("error" in jobStatus) return jobStatus;

  const requestWritten = await writeWorkerFile(`jobs/review-requests/${jobId}.json`, Buffer.from(`${JSON.stringify(request, null, 2)}\n`, "utf8"));
  if ("error" in requestWritten) return requestWritten;

  return { ok: true, jobId, message: "Plan de limpieza enviado al PC. Actualiza estado cuando termine." };
}
