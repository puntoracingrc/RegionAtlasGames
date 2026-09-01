import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";
import { appDataFile } from "./app-data-dir";
import {
  assertDurableBlobConfigured,
  blobAuthConfigured,
  blobAuthOptions,
} from "./blob-auth";
import type { CollectionPhotoSlot } from "./types";

function storageKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function collectionPhotoBlobPath(
  userId: string,
  itemId: string,
  slot: CollectionPhotoSlot,
): string {
  return `region-atlas/collections/photos/${storageKey(userId)}/${storageKey(itemId)}/${slot}.jpg`;
}

function collectionPhotoDiskPath(
  userId: string,
  itemId: string,
  slot: CollectionPhotoSlot,
): string {
  return appDataFile(path.join(
    "collections",
    "_photos",
    storageKey(userId),
    storageKey(itemId),
    `${slot}.jpg`,
  ));
}

export async function saveCollectionPhotoFile(
  userId: string,
  itemId: string,
  slot: CollectionPhotoSlot,
  buffer: Buffer,
): Promise<void> {
  if (process.env.VERCEL) {
    assertDurableBlobConfigured();
    const auth = await blobAuthOptions("private");
    await put(collectionPhotoBlobPath(userId, itemId, slot), buffer, {
      ...auth,
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return;
  }

  const filename = collectionPhotoDiskPath(userId, itemId, slot);
  const directory = path.dirname(filename);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  writeFileSync(filename, buffer);
}

export async function readCollectionPhotoFile(
  userId: string,
  itemId: string,
  slot: CollectionPhotoSlot,
): Promise<Response | null> {
  if (process.env.VERCEL && blobAuthConfigured()) {
    const auth = await blobAuthOptions("private");
    const result = await get(collectionPhotoBlobPath(userId, itemId, slot), {
      ...auth,
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  }

  try {
    return new Response(readFileSync(collectionPhotoDiskPath(userId, itemId, slot)), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return null;
  }
}

export async function deleteCollectionPhotoFile(
  userId: string,
  itemId: string,
  slot: CollectionPhotoSlot,
): Promise<void> {
  if (process.env.VERCEL) {
    assertDurableBlobConfigured();
    const auth = await blobAuthOptions("private");
    await del(collectionPhotoBlobPath(userId, itemId, slot), auth);
    return;
  }

  try {
    unlinkSync(collectionPhotoDiskPath(userId, itemId, slot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
