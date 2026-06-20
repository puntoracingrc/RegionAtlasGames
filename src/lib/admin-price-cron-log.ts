import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { appDataDir } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";

export type AdminPriceCronAttempt = {
  id: string;
  at: string;
  status: "started" | "done" | "blocked" | "skipped" | "error";
  step?: string | null;
  label?: string | null;
  jobId?: string | null;
  message?: string | null;
  userAgent?: string | null;
};

type AdminPriceCronLog = {
  version: number;
  updatedAt: string;
  attempts: AdminPriceCronAttempt[];
};

const CRON_LOG_DIR =
  process.env.ADMIN_PRICE_CRON_LOG_DIR ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "price-cron")
    : path.join(process.cwd(), "data", "admin", "price-cron"));
const CRON_LOG_FILE = path.join(CRON_LOG_DIR, "index.json");
const CRON_LOG_BLOB_PATH = "region-atlas/admin/price-cron/index.json";

function emptyCronLog(): AdminPriceCronLog {
  return { version: 1, updatedAt: new Date().toISOString(), attempts: [] };
}

function shouldUseBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function parseCronLog(raw: string): AdminPriceCronLog {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminPriceCronLog>;
    const attempts = Array.isArray(parsed.attempts)
      ? parsed.attempts.filter((attempt): attempt is AdminPriceCronAttempt =>
          Boolean(
            attempt &&
              typeof attempt.id === "string" &&
              typeof attempt.at === "string" &&
              (attempt.status === "started" ||
                attempt.status === "done" ||
                attempt.status === "blocked" ||
                attempt.status === "skipped" ||
                attempt.status === "error"),
          ),
        )
      : [];
    return {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      attempts,
    };
  } catch {
    return emptyCronLog();
  }
}

function readCronLogFromDisk(): AdminPriceCronLog | null {
  try {
    if (!existsSync(CRON_LOG_FILE)) return null;
    return parseCronLog(readFileSync(CRON_LOG_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeCronLogToDisk(log: AdminPriceCronLog): void {
  if (!existsSync(CRON_LOG_DIR)) mkdirSync(CRON_LOG_DIR, { recursive: true });
  writeFileSync(CRON_LOG_FILE, JSON.stringify(log, null, 2), "utf8");
}

async function readCronLogFromBlob(): Promise<AdminPriceCronLog | null> {
  if (!shouldUseBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(CRON_LOG_BLOB_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    return parseCronLog(await new Response(result.stream).text());
  } catch {
    return null;
  }
}

async function writeCronLogToBlob(log: AdminPriceCronLog): Promise<void> {
  if (!shouldUseBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(CRON_LOG_BLOB_PATH, JSON.stringify(log, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 30,
  });
}

async function readCronLog(): Promise<AdminPriceCronLog> {
  return (await readCronLogFromBlob()) ?? readCronLogFromDisk() ?? emptyCronLog();
}

async function writeCronLog(log: AdminPriceCronLog): Promise<void> {
  const payload = { ...log, updatedAt: new Date().toISOString() };
  try {
    writeCronLogToDisk(payload);
  } catch {
    // En Vercel puede no interesarnos el disco; Blob queda como fuente persistente.
  }
  await writeCronLogToBlob(payload);
}

export async function recordAdminPriceCronAttempt(
  attempt: Omit<AdminPriceCronAttempt, "id" | "at"> & { id?: string; at?: string },
): Promise<AdminPriceCronAttempt> {
  const entry: AdminPriceCronAttempt = {
    id: attempt.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: attempt.at ?? new Date().toISOString(),
    status: attempt.status,
    step: attempt.step ?? null,
    label: attempt.label ?? null,
    jobId: attempt.jobId ?? null,
    message: attempt.message ?? null,
    userAgent: attempt.userAgent ?? null,
  };
  const log = await readCronLog();
  log.attempts = [entry, ...log.attempts]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 50);
  await writeCronLog(log);
  return entry;
}

export async function listAdminPriceCronAttempts(limit = 12): Promise<AdminPriceCronAttempt[]> {
  const log = await readCronLog();
  return log.attempts
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
