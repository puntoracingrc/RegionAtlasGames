import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";
import { revalidateTag, unstable_cache } from "next/cache";
import {
  assertDurableBlobConfigured,
  blobAuthConfigured,
  blobAuthOptions,
} from "./blob-auth";
import { appDataDir, ensureAppDataDir } from "./app-data-dir";
import type { CatalogStagingGame, CatalogStagingIndex } from "./catalog-staging-types";

const STAGING_BLOB_PREFIX = "region-atlas/staging";
const STAGING_CACHE_TAG = "catalog-staging";
const MAX_TRACKED_USERS = 200;

function shouldUseBlobStorage(): boolean {
  assertDurableBlobConfigured();
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
  const parsed = JSON.parse(raw) as CatalogStagingIndex;
  if (!parsed || !Array.isArray(parsed.pcIds) || typeof parsed.byPlatform !== "object") {
    throw new Error("El índice de staging no tiene un formato válido.");
  }
  return parsed;
}

function parseGame(raw: string, pcId: number): CatalogStagingGame | null {
  const parsed = JSON.parse(raw) as CatalogStagingGame;
  if (!parsed || parsed.pcId !== pcId) {
    throw new Error(`La ficha de staging ${pcId} no tiene un formato válido.`);
  }
  return parsed;
}

function readIndexFromDisk(): CatalogStagingIndex {
  try {
    return parseIndex(readFileSync(stagingIndexDiskPath(), "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyIndex();
    throw error;
  }
}

async function readIndexFromBlobFresh(): Promise<CatalogStagingIndex> {
  const auth = await blobAuthOptions("private");
  const result = await get(stagingIndexBlobPath(), { ...auth, useCache: false });
  if (!result) return emptyIndex();
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`No se pudo leer el índice de staging (HTTP ${result.statusCode}).`);
  }
  const text = await new Response(result.stream).text();
  return parseIndex(text);
}

const readIndexFromBlobCached = unstable_cache(
  readIndexFromBlobFresh,
  ["catalog-staging-index"],
  { revalidate: 30, tags: [STAGING_CACHE_TAG] },
);

async function readIndexFromBlob(options?: { fresh?: boolean }): Promise<CatalogStagingIndex> {
  return options?.fresh ? readIndexFromBlobFresh() : readIndexFromBlobCached();
}

export async function readCatalogStagingIndex(options?: { fresh?: boolean }): Promise<CatalogStagingIndex> {
  if (shouldUseBlobStorage()) {
    const blobIndex = await readIndexFromBlob(options);
    if (blobIndex.pcIds.length > 0) return blobIndex;
    if (process.env.VERCEL) return blobIndex;
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
  if (shouldUseBlobStorage()) {
    if (!process.env.VERCEL) writeIndexToDisk(payload);
    const blobResult = await writeIndexToBlob(payload);
    return blobResult;
  }
  const diskResult = writeIndexToDisk(payload);
  if ("error" in diskResult) return diskResult;
  return { ok: true };
}

function readGameFromDisk(pcId: number): CatalogStagingGame | null {
  try {
    return parseGame(readFileSync(stagingGameDiskPath(pcId), "utf-8"), pcId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readGameFromBlobFresh(pcId: number): Promise<CatalogStagingGame | null> {
  const auth = await blobAuthOptions("private");
  const result = await get(stagingGameBlobPath(pcId), { ...auth, useCache: false });
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`No se pudo leer la ficha de staging ${pcId} (HTTP ${result.statusCode}).`);
  }
  const text = await new Response(result.stream).text();
  return parseGame(text, pcId);
}

const readGameFromBlobCached = unstable_cache(
  readGameFromBlobFresh,
  ["catalog-staging-game"],
  { revalidate: 30, tags: [STAGING_CACHE_TAG] },
);

async function readGameFromBlob(pcId: number, options?: { fresh?: boolean }): Promise<CatalogStagingGame | null> {
  return options?.fresh ? readGameFromBlobFresh(pcId) : readGameFromBlobCached(pcId);
}

export async function readCatalogStagingGame(
  pcId: number,
  options?: { fresh?: boolean },
): Promise<CatalogStagingGame | null> {
  if (shouldUseBlobStorage()) {
    const blobGame = await readGameFromBlob(pcId, options);
    if (blobGame || process.env.VERCEL) return blobGame;
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
  if (shouldUseBlobStorage()) {
    if (!process.env.VERCEL) writeGameToDisk(game);
    const blobResult = await writeGameToBlob(game);
    return blobResult;
  }
  const diskResult = writeGameToDisk(game);
  if ("error" in diskResult) return diskResult;
  return { ok: true };
}

export async function deleteCatalogStagingGame(
  pcId: number,
): Promise<{ ok: true; removed: boolean } | { error: string }> {
  const game = await readCatalogStagingGame(pcId, { fresh: true });
  const index = await readCatalogStagingIndex({ fresh: true });
  const hadEntry = index.pcIds.includes(pcId);
  index.pcIds = index.pcIds.filter((id) => id !== pcId);
  if (game && hadEntry) applyCatalogStagingGameTransition(index, game, null);

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

function adjustStatusCount(
  stats: CatalogStagingIndex["byPlatform"][string],
  game: CatalogStagingGame,
  delta: 1 | -1,
): void {
  if (game.status === "promoted") {
    stats.promoted = Math.max(0, stats.promoted + delta);
  } else if (game.status === "enriched") {
    stats.enriched = Math.max(0, stats.enriched + delta);
  } else {
    stats.pendingEnrich = Math.max(0, stats.pendingEnrich + delta);
  }
}

export function applyCatalogStagingGameTransition(
  index: CatalogStagingIndex,
  before: CatalogStagingGame | null,
  after: CatalogStagingGame | null,
): void {
  if (before) {
    const stats = index.byPlatform[before.platformSlug];
    if (stats) {
      stats.games = Math.max(0, stats.games - 1);
      stats.units = Math.max(0, stats.units - before.unitCount);
      adjustStatusCount(stats, before, -1);
    }
  }

  if (after) {
    const stats = index.byPlatform[after.platformSlug] ?? {
      games: 0,
      units: 0,
      pendingEnrich: 0,
      enriched: 0,
      promoted: 0,
    };
    index.byPlatform[after.platformSlug] = stats;
    stats.games += 1;
    stats.units += after.unitCount;
    adjustStatusCount(stats, after, 1);
  }
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

export type CatalogStagingEnrichmentSelection = {
  targets: CatalogStagingGame[];
  scanned: number;
  nextCursor: number;
  total: number;
};

export function catalogStagingScanWindow(
  pcIds: number[],
  cursor: number,
  limit: number,
): number[] {
  if (pcIds.length === 0 || limit <= 0) return [];
  const start = ((cursor % pcIds.length) + pcIds.length) % pcIds.length;
  const count = Math.min(pcIds.length, Math.max(0, limit));
  return Array.from({ length: count }, (_, offset) => pcIds[(start + offset) % pcIds.length]);
}

export async function findCatalogStagingEnrichmentTargets(input: {
  limit: number;
  maxScan?: number;
  concurrency?: number;
}): Promise<CatalogStagingEnrichmentSelection> {
  const index = await readCatalogStagingIndex({ fresh: true });
  const total = index.pcIds.length;
  if (total === 0 || input.limit <= 0) {
    return { targets: [], scanned: 0, nextCursor: 0, total };
  }

  const cursor = index.enrichmentCursor ?? 0;
  const ids = catalogStagingScanWindow(index.pcIds, cursor, input.maxScan ?? 96);
  const concurrency = Math.min(16, Math.max(1, input.concurrency ?? 8));
  const candidates: CatalogStagingGame[] = [];
  let scanned = 0;

  for (let offset = 0; offset < ids.length; offset += concurrency) {
    const chunk = ids.slice(offset, offset + concurrency);
    const games = await Promise.all(
      chunk.map((pcId) => readCatalogStagingGame(pcId, { fresh: true })),
    );
    scanned += chunk.length;
    for (const game of games) {
      if (game?.status === "pending-catalog") candidates.push(game);
    }
    if (candidates.length >= input.limit) break;
  }

  const targets = candidates
    .sort((a, b) => b.unitCount - a.unitCount || b.userCount - a.userCount)
    .slice(0, input.limit);
  return {
    targets,
    scanned,
    nextCursor: total > 0 ? (cursor + scanned) % total : 0,
    total,
  };
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
