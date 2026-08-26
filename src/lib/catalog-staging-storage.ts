import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";
import { revalidateTag, unstable_cache } from "next/cache";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { appDataDir, ensureAppDataDir } from "./app-data-dir";
import type { CatalogStagingGame, CatalogStagingIndex } from "./catalog-staging-types";

const STAGING_BLOB_PREFIX = "region-atlas/staging";
const STAGING_CACHE_TAG = "catalog-staging";
const MAX_TRACKED_USERS = 200;

function shouldUseBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function stagingRootDir(): string {
  ensureAppDataDir();
  return path.join(appDataDir(), "staging");
}

function stagingGamesDir(): string {
  return path.join(stagingRootDir(), "games");
}

function stagingIndexDiskPath(): string {
  return path.join(stagingRootDir(), "index.json");
}

function stagingGameDiskPath(pcId: number): string {
  return path.join(stagingGamesDir(), `${pcId}.json`);
}

function stagingIndexBlobPath(): string {
  return `${STAGING_BLOB_PREFIX}/index.json`;
}

function stagingGameBlobPath(pcId: number): string {
  return `${STAGING_BLOB_PREFIX}/games/${pcId}.json`;
}

function emptyIndex(): CatalogStagingIndex {
  return { updatedAt: new Date().toISOString(), pcIds: [], byPlatform: {} };
}

function parseIndex(raw: string): CatalogStagingIndex {
  try {
    const parsed = JSON.parse(raw) as CatalogStagingIndex;
    if (!parsed || !Array.isArray(parsed.pcIds) || typeof parsed.byPlatform !== "object") {
      return emptyIndex();
    }
    return parsed;
  } catch {
    return emptyIndex();
  }
}

function parseGame(raw: string, pcId: number): CatalogStagingGame | null {
  try {
    const parsed = JSON.parse(raw) as CatalogStagingGame;
    if (!parsed || parsed.pcId !== pcId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readIndexFromDisk(): CatalogStagingIndex {
  try {
    return parseIndex(readFileSync(stagingIndexDiskPath(), "utf-8"));
  } catch {
    return emptyIndex();
  }
}

async function readIndexFromBlobFresh(): Promise<CatalogStagingIndex> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(stagingIndexBlobPath(), { ...auth, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return emptyIndex();
    const text = await new Response(result.stream).text();
    return parseIndex(text);
  } catch {
    return emptyIndex();
  }
}

const readIndexFromBlobCached = unstable_cache(
  readIndexFromBlobFresh,
  ["catalog-staging-index"],
  { revalidate: 30, tags: [STAGING_CACHE_TAG] },
);

async function readIndexFromBlob(options?: { fresh?: boolean }): Promise<CatalogStagingIndex> {
  return options?.fresh ? readIndexFromBlobFresh() : readIndexFromBlobCached();
}

export async function readCatalogStagingIndex(): Promise<CatalogStagingIndex> {
  if (shouldUseBlobStorage()) {
    const blobIndex = await readIndexFromBlob();
    if (blobIndex.pcIds.length > 0) return blobIndex;
    const diskIndex = readIndexFromDisk();
    if (diskIndex.pcIds.length > 0) {
      await writeCatalogStagingIndex(diskIndex);
      return diskIndex;
    }
    return blobIndex;
  }
  return readIndexFromDisk();
}

function writeIndexToDisk(index: CatalogStagingIndex): { ok: true } | { error: string } {
  try {
    const root = stagingRootDir();
    const gamesDir = stagingGamesDir();
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    if (!existsSync(gamesDir)) mkdirSync(gamesDir, { recursive: true });
    writeFileSync(stagingIndexDiskPath(), JSON.stringify(index, null, 2), "utf-8");
    return { ok: true };
  } catch {
    return { error: "No se pudo guardar el índice de staging en disco." };
  }
}

async function writeIndexToBlob(index: CatalogStagingIndex): Promise<{ ok: true } | { error: string }> {
  try {
    const auth = await blobAuthOptions("private");
    await put(stagingIndexBlobPath(), JSON.stringify(index, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    revalidateTag(STAGING_CACHE_TAG, { expire: 0 });
    return { ok: true };
  } catch (error) {
    console.error("[catalog-staging] blob index write failed", error);
    return { error: "No se pudo guardar el índice de staging en Blob." };
  }
}

export async function writeCatalogStagingIndex(
  index: CatalogStagingIndex,
): Promise<{ ok: true } | { error: string }> {
  const payload = { ...index, updatedAt: new Date().toISOString() };
  const diskResult = writeIndexToDisk(payload);
  if (shouldUseBlobStorage()) {
    const blobResult = await writeIndexToBlob(payload);
    if ("ok" in blobResult) return { ok: true };
    if ("error" in diskResult) return blobResult;
    console.warn("[catalog-staging] blob index write failed; kept on disk");
    return { ok: true };
  }
  if ("error" in diskResult) return diskResult;
  return { ok: true };
}

function readGameFromDisk(pcId: number): CatalogStagingGame | null {
  try {
    return parseGame(readFileSync(stagingGameDiskPath(pcId), "utf-8"), pcId);
  } catch {
    return null;
  }
}

async function readGameFromBlobFresh(pcId: number): Promise<CatalogStagingGame | null> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(stagingGameBlobPath(pcId), { ...auth, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return parseGame(text, pcId);
  } catch {
    return null;
  }
}

const readGameFromBlobCached = unstable_cache(
  readGameFromBlobFresh,
  ["catalog-staging-game"],
  { revalidate: 30, tags: [STAGING_CACHE_TAG] },
);

async function readGameFromBlob(pcId: number, options?: { fresh?: boolean }): Promise<CatalogStagingGame | null> {
  return options?.fresh ? readGameFromBlobFresh(pcId) : readGameFromBlobCached(pcId);
}

export async function readCatalogStagingGame(pcId: number): Promise<CatalogStagingGame | null> {
  if (shouldUseBlobStorage()) {
    const blobGame = await readGameFromBlob(pcId);
    if (blobGame) return blobGame;
    return readGameFromDisk(pcId);
  }
  return readGameFromDisk(pcId);
}

function writeGameToDisk(game: CatalogStagingGame): { ok: true } | { error: string } {
  try {
    const gamesDir = stagingGamesDir();
    if (!existsSync(gamesDir)) mkdirSync(gamesDir, { recursive: true });
    writeFileSync(stagingGameDiskPath(game.pcId), JSON.stringify(game, null, 2), "utf-8");
    return { ok: true };
  } catch {
    return { error: "No se pudo guardar el juego de staging en disco." };
  }
}

async function writeGameToBlob(game: CatalogStagingGame): Promise<{ ok: true } | { error: string }> {
  try {
    const auth = await blobAuthOptions("private");
    await put(stagingGameBlobPath(game.pcId), JSON.stringify(game, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    revalidateTag(STAGING_CACHE_TAG, { expire: 0 });
    return { ok: true };
  } catch (error) {
    console.error("[catalog-staging] blob game write failed", error);
    return { error: "No se pudo guardar el juego de staging en Blob." };
  }
}

export async function writeCatalogStagingGame(
  game: CatalogStagingGame,
): Promise<{ ok: true } | { error: string }> {
  const diskResult = writeGameToDisk(game);
  if (shouldUseBlobStorage()) {
    const blobResult = await writeGameToBlob(game);
    if ("ok" in blobResult) return { ok: true };
    if ("error" in diskResult) return blobResult;
    console.warn("[catalog-staging] blob game write failed; kept on disk");
    return { ok: true };
  }
  if ("error" in diskResult) return diskResult;
  return { ok: true };
}

export async function deleteCatalogStagingGame(
  pcId: number,
): Promise<{ ok: true; removed: boolean } | { error: string }> {
  const index = await readCatalogStagingIndex();
  const hadEntry = index.pcIds.includes(pcId);
  index.pcIds = index.pcIds.filter((id) => id !== pcId);

  const remaining: CatalogStagingGame[] = [];
  for (const id of index.pcIds) {
    const game = await readCatalogStagingGame(id);
    if (game) remaining.push(game);
  }
  index.byPlatform = rebuildPlatformStats(remaining);

  const indexSaved = await writeCatalogStagingIndex(index);
  if ("error" in indexSaved) return indexSaved;

  try {
    unlinkSync(stagingGameDiskPath(pcId));
  } catch {
    /* missing on disk */
  }

  if (shouldUseBlobStorage()) {
    try {
      const auth = await blobAuthOptions("private");
      await del(stagingGameBlobPath(pcId), auth);
      revalidateTag(STAGING_CACHE_TAG, { expire: 0 });
    } catch (error) {
      console.warn("[catalog-staging] blob delete failed", pcId, error);
    }
  }

  return { ok: true, removed: hadEntry };
}

export function trackUserId(existing: string[], userId: string): { userIds: string[]; isNew: boolean } {
  if (existing.includes(userId)) return { userIds: existing, isNew: false };
  const next = [...existing, userId];
  if (next.length <= MAX_TRACKED_USERS) return { userIds: next, isNew: true };
  return { userIds: next.slice(-MAX_TRACKED_USERS), isNew: true };
}

export function rebuildPlatformStats(games: CatalogStagingGame[]): CatalogStagingIndex["byPlatform"] {
  const byPlatform: CatalogStagingIndex["byPlatform"] = {};
  for (const game of games) {
    const slug = game.platformSlug;
    if (!byPlatform[slug]) {
      byPlatform[slug] = { games: 0, units: 0, pendingEnrich: 0, enriched: 0, promoted: 0 };
    }
    const stats = byPlatform[slug];
    stats.games += 1;
    stats.units += game.unitCount;
    if (game.status === "promoted") stats.promoted += 1;
    else if (game.status === "enriched") stats.enriched += 1;
    else stats.pendingEnrich += 1;
  }
  return byPlatform;
}

export async function listCatalogStagingGames(limit = 5000): Promise<CatalogStagingGame[]> {
  const index = await readCatalogStagingIndex();
  const games: CatalogStagingGame[] = [];
  for (const pcId of index.pcIds.slice(0, limit)) {
    const game = await readCatalogStagingGame(pcId);
    if (game) games.push(game);
  }
  return games;
}

export function catalogStagingStorageBackend(): "blob" | "disk" {
  return shouldUseBlobStorage() ? "blob" : "disk";
}

/** Sincroniza disco → blob cuando hay token (util para scripts locales). */
export async function syncStagingDiskToBlob(): Promise<{ synced: number } | { error: string }> {
  if (!shouldUseBlobStorage()) return { error: "Blob no configurado." };
  const gamesDir = stagingGamesDir();
  if (!existsSync(gamesDir)) return { synced: 0 };
  const files = readdirSync(gamesDir).filter((name) => name.endsWith(".json"));
  const games: CatalogStagingGame[] = [];
  for (const file of files) {
    const pcId = Number.parseInt(file.replace(".json", ""), 10);
    if (!Number.isFinite(pcId)) continue;
    const game = readGameFromDisk(pcId);
    if (game) games.push(game);
  }
  for (const game of games) {
    const saved = await writeGameToBlob(game);
    if ("error" in saved) return saved;
  }
  const index = readIndexFromDisk();
  if (index.pcIds.length === 0 && games.length > 0) {
    index.pcIds = games.map((g) => g.pcId).sort((a, b) => a - b);
    index.byPlatform = rebuildPlatformStats(games);
  }
  const indexSaved = await writeIndexToBlob(index);
  if ("error" in indexSaved) return indexSaved;
  return { synced: games.length };
}
