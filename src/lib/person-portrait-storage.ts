import "server-only";

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { get, put } from "@vercel/blob";
import { appDataFile } from "./app-data-dir";
import {
  assertDurableBlobConfigured,
  blobAuthConfigured,
  blobAuthOptions,
} from "./blob-auth";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
} from "./json-document-store";
import type { NormalizedPersonPortrait } from "./person-portrait-upload";

const DOCUMENT_PATH = "region-atlas/admin/person-portraits.json";
const PORTRAIT_ROOT = "region-atlas/person-portraits-admin";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[a-f0-9]{64}$/;

export type AdminPersonPortraitRecord = {
  slug: string;
  path: string;
  blobPath: string;
  contentHash: string;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
  originalFilename: string;
  uploadedAt: string;
  uploadedBy: string;
  rightsConfirmedAt: string;
};

type PersonPortraitDocument = {
  schemaVersion: 1;
  updatedAt: string;
  portraits: Record<string, AdminPersonPortraitRecord>;
};

function validSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

function validVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

function portraitBlobPath(slug: string, contentHash: string): string {
  if (!validSlug(slug) || !validVersion(contentHash)) {
    throw new Error("Identidad de retrato no válida.");
  }
  return `${PORTRAIT_ROOT}/${slug}/${contentHash}.webp`;
}

function portraitDiskPath(slug: string, contentHash: string): string {
  return appDataFile(path.join("person-portraits-admin", slug, `${contentHash}.webp`));
}

export function personPortraitPublicPath(slug: string, contentHash: string): string {
  if (!validSlug(slug) || !validVersion(contentHash)) {
    throw new Error("Identidad de retrato no válida.");
  }
  return `/api/persona/${slug}/portrait/${contentHash}.webp`;
}

function emptyDocument(): PersonPortraitDocument {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    portraits: {},
  };
}

function isPortraitRecord(value: unknown): value is AdminPersonPortraitRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AdminPersonPortraitRecord>;
  return Boolean(
    typeof record.slug === "string" && validSlug(record.slug)
      && typeof record.path === "string"
      && typeof record.blobPath === "string"
      && typeof record.contentHash === "string" && validVersion(record.contentHash)
      && record.contentType === "image/webp"
      && typeof record.width === "number" && record.width > 0
      && typeof record.height === "number" && record.height > 0
      && typeof record.bytes === "number" && record.bytes > 0
      && typeof record.originalFilename === "string"
      && typeof record.uploadedAt === "string"
      && typeof record.uploadedBy === "string"
      && typeof record.rightsConfirmedAt === "string",
  );
}

function parseDocument(raw: string): PersonPortraitDocument {
  const parsed = JSON.parse(raw) as Partial<PersonPortraitDocument>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("El índice de retratos administrativos no es válido.");
  }
  const portraits = Object.fromEntries(
    Object.entries(parsed.portraits ?? {}).filter(([slug, record]) => (
      validSlug(slug) && isPortraitRecord(record) && record.slug === slug
    )),
  );
  return {
    schemaVersion: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    portraits,
  };
}

function blobOptions() {
  return {
    pathname: DOCUMENT_PATH,
    empty: emptyDocument,
    parse: parseDocument,
    maximumSizeInBytes: 2 * 1024 * 1024,
    cacheControlMaxAge: 30,
  };
}

function diskOptions() {
  return {
    pathname: appDataFile(path.join("person-portraits-admin", "index.json")),
    empty: emptyDocument,
    parse: parseDocument,
  };
}

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

async function readDocument(): Promise<PersonPortraitDocument> {
  if (shouldUseBlobStorage()) return readBlobJsonDocument(blobOptions());
  return readDiskJsonDocument(diskOptions());
}

export async function readAdminPersonPortraits(): Promise<Record<string, AdminPersonPortraitRecord>> {
  return (await readDocument()).portraits;
}

export async function readAdminPersonPortraitsSafely(): Promise<Record<string, AdminPersonPortraitRecord>> {
  try {
    return await readAdminPersonPortraits();
  } catch (error) {
    console.error("[person-portrait-storage] read failed", error);
    return {};
  }
}

async function savePortraitBytes(
  slug: string,
  contentHash: string,
  buffer: Buffer,
): Promise<string> {
  const blobPath = portraitBlobPath(slug, contentHash);
  if (shouldUseBlobStorage()) {
    const auth = await blobAuthOptions("private");
    await put(blobPath, buffer, {
      ...auth,
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return blobPath;
  }

  const filename = portraitDiskPath(slug, contentHash);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, buffer, { mode: 0o600 });
  return blobPath;
}

export async function saveAdminPersonPortrait(input: {
  slug: string;
  portrait: NormalizedPersonPortrait;
  originalFilename: string;
  uploadedBy: string;
}): Promise<AdminPersonPortraitRecord> {
  if (!validSlug(input.slug)) throw new Error("La persona indicada no es válida.");
  const now = new Date().toISOString();
  const blobPath = await savePortraitBytes(
    input.slug,
    input.portrait.contentHash,
    input.portrait.buffer,
  );
  const record: AdminPersonPortraitRecord = {
    slug: input.slug,
    path: personPortraitPublicPath(input.slug, input.portrait.contentHash),
    blobPath,
    contentHash: input.portrait.contentHash,
    contentType: input.portrait.contentType,
    width: input.portrait.width,
    height: input.portrait.height,
    bytes: input.portrait.bytes,
    originalFilename: path.basename(input.originalFilename || "retrato").slice(0, 240),
    uploadedAt: now,
    uploadedBy: input.uploadedBy,
    rightsConfirmedAt: now,
  };

  const mutate = (current: PersonPortraitDocument) => ({
    next: {
      schemaVersion: 1 as const,
      updatedAt: now,
      portraits: { ...current.portraits, [input.slug]: record },
    },
    result: record,
  });
  if (shouldUseBlobStorage()) return mutateBlobJsonDocument(blobOptions(), mutate);
  return mutateDiskJsonDocument(diskOptions(), mutate);
}

export async function readAdminPersonPortraitFile(
  slug: string,
  contentHash: string,
): Promise<Response | null> {
  if (!validSlug(slug) || !validVersion(contentHash)) return null;
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${contentHash}"`,
  };

  if (shouldUseBlobStorage()) {
    const auth = await blobAuthOptions("private");
    const result = await get(portraitBlobPath(slug, contentHash), { ...auth, useCache: true });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return new Response(result.stream, { headers });
  }

  try {
    return new Response(await readFile(portraitDiskPath(slug, contentHash)), { headers });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
