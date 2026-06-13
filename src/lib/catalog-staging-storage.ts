import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { ensureAppDataDir } from "./app-data-dir";
import type { CatalogStagingGame, CatalogStagingIndex } from "./catalog-staging-types";

const STAGING_BLOB_PREFIX = "region-atlas/staging";
const MAX_TRACKED_USERS = 200;

function useBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function stagingRootDir(): string {
  return path.join(process.cwd(), "data", "staging");
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

async function readIndexFromBlob(): Promise<CatalogStagingIndex> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(stagingIndexBlobPath(), auth);
    if (!result || result.statusCode !== 200 || !result.stream) return emptyIndex();
    const text = await new Response(result.stream).text();
    return parseIndex(text);
  } catch {
    return emptyIndex();
  }
}

export async function readCatalogStagingIndex(): Promise<CatalogStagingIndex> {
  if (useBlobStorage()) {
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
    });
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
  if ("error" in diskResult) return diskResult;
  if (useBlobStorage()) {
    const blobResult = await writeIndexToBlob(payload);
    if ("error" in blobResult) {
      console.warn("[catalog-staging] blob index write failed; kept on disk", blobResult.error);
    }
  }
  return { ok: true };
}

function readGameFromDisk(pcId: number): CatalogStagingGame | null {
  try {
    return parseGame(readFileSync(stagingGameDiskPath(pcId), "utf-8"), pcId);
  } catch {
    return null;
  }
}

async function readGameFromBlob(pcId: number): Promise<CatalogStagingGame | null> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(stagingGameBlobPath(pcId), auth);
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return parseGame(text, pcId);
  } catch {
    return null;
  }
}

export async function readCatalogStagingGame(pcId: number): Promise<CatalogStagingGame | null> {
  if (useBlobStorage()) {
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
    });
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
  if ("error" in diskResult) return diskResult;
  if (useBlobStorage()) {
    const blobResult = await writeGameToBlob(game);
    if ("error" in blobResult) {
      console.warn("[catalog-staging] blob game write failed; kept on disk", blobResult.error);
    }
  }
  return { ok: true };
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
  return useBlobStorage() ? "blob" : "disk";
}

/** Sincroniza disco → blob cuando hay token (util para scripts locales). */
export async function syncStagingDiskToBlob(): Promise<{ synced: number } | { error: string }> {
  if (!useBlobStorage()) return { error: "Blob no configurado." };
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
