import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { ensureAppDataDir } from "./app-data-dir";
import type { CollectionItem } from "./types";
import { repairCollectionPlatform } from "./import-collection";

export type UserCollectionFile = {
  userId: string;
  importedAt: string | null;
  source: string | null;
  items: CollectionItem[];
  catalogGapReportSentAt?: string | null;
};

function shouldUseBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function collectionsDir(): string {
  return path.join(ensureAppDataDir(), "collections");
}

function collectionDiskPath(userId: string): string {
  return path.join(collectionsDir(), `${userId}.json`);
}

function collectionBlobPath(userId: string): string {
  return `region-atlas/collections/${userId}.json`;
}

function emptyCollection(userId: string): UserCollectionFile {
  return { userId, importedAt: null, source: null, items: [] };
}

function parseCollection(raw: string, userId: string): UserCollectionFile {
  try {
    const parsed = JSON.parse(raw) as UserCollectionFile;
    if (!parsed || parsed.userId !== userId || !Array.isArray(parsed.items)) {
      return emptyCollection(userId);
    }
    return parsed;
  } catch {
    return emptyCollection(userId);
  }
}

function readCollectionFromDisk(userId: string): UserCollectionFile {
  const candidates = [
    collectionDiskPath(userId),
    path.join(process.cwd(), "data", "collections", `${userId}.json`),
  ];
  for (const file of candidates) {
    try {
      return parseCollection(readFileSync(file, "utf-8"), userId);
    } catch {
      continue;
    }
  }
  return emptyCollection(userId);
}

async function readCollectionFromBlob(userId: string): Promise<UserCollectionFile> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(collectionBlobPath(userId), { ...auth, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return emptyCollection(userId);
    const text = await new Response(result.stream).text();
    return parseCollection(text, userId);
  } catch {
    return emptyCollection(userId);
  }
}

function writeCollectionToDisk(data: UserCollectionFile): { ok: true } | { error: string } {
  try {
    const dir = collectionsDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(collectionDiskPath(data.userId), JSON.stringify(data, null, 2), "utf-8");
    return { ok: true };
  } catch {
    return { error: "No se pudo guardar la colección en disco." };
  }
}

async function writeCollectionToBlob(
  data: UserCollectionFile,
): Promise<{ ok: true } | { error: string }> {
  try {
    const auth = await blobAuthOptions("private");
    await put(collectionBlobPath(data.userId), JSON.stringify(data, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return { ok: true };
  } catch (error) {
    console.error("[collection-storage] blob write failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return { error: `No se pudo guardar la colección en Vercel Blob: ${detail}` };
  }
}

export async function loadUserCollection(userId: string): Promise<UserCollectionFile> {
  let data: UserCollectionFile;

  if (shouldUseBlobStorage()) {
    const blobData = await readCollectionFromBlob(userId);
    if (blobData.items.length > 0 || blobData.importedAt) {
      data = blobData;
    } else {
      const localData = readCollectionFromDisk(userId);
      if (localData.items.length > 0 || localData.importedAt) {
        await writeCollectionToBlob(localData);
        data = localData;
      } else {
        data = blobData;
      }
    }
  } else {
    data = readCollectionFromDisk(userId);
  }

  const repairedItems = data.items.map(repairCollectionPlatform);
  const needsSave = repairedItems.some(
    (item, index) =>
      item.platformSlug !== data.items[index]?.platformSlug ||
      item.inRetroCatalog !== data.items[index]?.inRetroCatalog,
  );

  if (!needsSave) return data;

  const repaired: UserCollectionFile = { ...data, items: repairedItems };
  await saveUserCollectionFile(repaired);
  return repaired;
}

export async function saveUserCollectionFile(
  data: UserCollectionFile,
): Promise<{ ok: true } | { error: string }> {
  if (shouldUseBlobStorage()) {
    const blobResult = await writeCollectionToBlob(data);
    if ("error" in blobResult) return blobResult;
    // Copia local best-effort (dev / respaldo); la fuente de verdad en prod es Blob.
    writeCollectionToDisk(data);
    return { ok: true };
  }
  return writeCollectionToDisk(data);
}

export function collectionsStorageBackend(): "blob" | "disk" {
  return shouldUseBlobStorage() ? "blob" : "disk";
}
