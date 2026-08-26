import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { appDataDir } from "./app-data-dir";
import type { AdminGameDraft } from "./admin-draft-types";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { publishAdminGameDraft, type PublishResult } from "./admin-catalog-publish";

export type AdminPublishJobStatus = "running" | "done" | "error";

export type AdminPublishJob = {
  jobId: string;
  pcId: number;
  catalogId: string;
  title: string;
  status: AdminPublishJobStatus;
  startedAt: string;
  finishedAt?: string;
  url?: string;
  mode?: "overlay" | "disk" | "both";
  error?: string;
  deployHook?: { triggered: boolean; detail?: string };
};

const JOBS_DIR =
  process.env.ADMIN_PUBLISH_JOBS_DIR ??
  (process.env.VERCEL
    ? path.join(appDataDir(), "publish-jobs")
    : path.join(process.cwd(), "data", "admin", "publish-jobs"));
const JOBS_BLOB_PREFIX = "region-atlas/admin/publish-jobs";

function shouldUseBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function safeJobId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function jobDiskPath(jobId: string): string {
  return path.join(JOBS_DIR, `${safeJobId(jobId)}.json`);
}

function jobBlobPath(jobId: string): string {
  return `${JOBS_BLOB_PREFIX}/${safeJobId(jobId)}.json`;
}

function parseJob(raw: string): AdminPublishJob | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminPublishJob>;
    if (
      !parsed ||
      typeof parsed.jobId !== "string" ||
      typeof parsed.pcId !== "number" ||
      typeof parsed.catalogId !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.startedAt !== "string" ||
      (parsed.status !== "running" && parsed.status !== "done" && parsed.status !== "error")
    ) {
      return null;
    }
    return parsed as AdminPublishJob;
  } catch {
    return null;
  }
}

function writeJobToDisk(job: AdminPublishJob): void {
  if (!existsSync(JOBS_DIR)) mkdirSync(JOBS_DIR, { recursive: true });
  writeFileSync(jobDiskPath(job.jobId), JSON.stringify(job, null, 2), "utf8");
}

async function writeJobToBlob(job: AdminPublishJob): Promise<void> {
  if (!shouldUseBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(jobBlobPath(job.jobId), JSON.stringify(job, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 15,
  });
}

export async function writeAdminPublishJob(job: AdminPublishJob): Promise<void> {
  try {
    writeJobToDisk(job);
  } catch {
    /* Vercel disk can be read-only in some contexts; Blob is the source of truth there. */
  }
  await writeJobToBlob(job);
}

export async function readAdminPublishJob(jobId: string): Promise<AdminPublishJob | null> {
  const safe = safeJobId(jobId);
  if (!safe) return null;

  if (shouldUseBlobStorage()) {
    try {
      const auth = await blobAuthOptions("private");
      const result = await get(jobBlobPath(safe), { ...auth, useCache: false });
      if (result?.stream && result.statusCode === 200) {
        const parsed = parseJob(await new Response(result.stream).text());
        if (parsed) return parsed;
      }
    } catch {
      /* Fall back to disk below. */
    }
  }

  try {
    if (!existsSync(jobDiskPath(safe))) return null;
    return parseJob(readFileSync(jobDiskPath(safe), "utf8"));
  } catch {
    return null;
  }
}

export async function createAdminPublishJob(draft: AdminGameDraft): Promise<AdminPublishJob> {
  const job: AdminPublishJob = {
    jobId: `publish-${draft.pcId}-${Date.now()}`,
    pcId: draft.pcId,
    catalogId: draft.catalogId,
    title: draft.title,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await writeAdminPublishJob(job);
  return job;
}

function publishResultToJob(job: AdminPublishJob, result: PublishResult): AdminPublishJob {
  if ("error" in result) {
    return {
      ...job,
      status: "error",
      error: result.error,
      finishedAt: new Date().toISOString(),
    };
  }
  return {
    ...job,
    status: "done",
    catalogId: result.catalogId,
    url: result.url,
    mode: result.mode,
    deployHook: result.deployHook,
    finishedAt: new Date().toISOString(),
  };
}

export async function runAdminPublishJob(jobId: string, draft: AdminGameDraft): Promise<void> {
  const current =
    (await readAdminPublishJob(jobId)) ??
    ({
      jobId,
      pcId: draft.pcId,
      catalogId: draft.catalogId,
      title: draft.title,
      status: "running",
      startedAt: new Date().toISOString(),
    } satisfies AdminPublishJob);

  try {
    const result = await publishAdminGameDraft(draft);
    await writeAdminPublishJob(publishResultToJob(current, result));
  } catch (error) {
    await writeAdminPublishJob({
      ...current,
      status: "error",
      error: error instanceof Error ? error.message : "Error inesperado al publicar.",
      finishedAt: new Date().toISOString(),
    });
  }
}
