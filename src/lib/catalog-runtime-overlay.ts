import { del, get, put } from "@vercel/blob";
import { revalidateTag, unstable_cache } from "next/cache";
import { buildCatalogSeoSlug } from "./catalog-url";
import { getCatalogGame, listedCatalog } from "./catalog";
import {
  mergeCatalogGameWithOverlay,
  mergeCatalogPlatformGames,
  resolveCatalogOverlayCandidate,
} from "./catalog-overlay-merge";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { getStaticGameDetails } from "./static-game-details";
import {
  normalizeCatalogGamePresentation,
  normalizeGameDetailsPresentation,
} from "./catalog-presentation";
import type { CatalogGame, GameDetails } from "./types";

const OVERLAY_PREFIX = "region-atlas/catalog/overlay";
const INDEX_PATH = `${OVERLAY_PREFIX}/index.json`;
const OVERLAY_CACHE_TAG = "catalog-overlay";

export type CatalogOverlayIndex = {
  updatedAt: string;
  ids: string[];
  byPlatform: Record<string, string[]>;
  seoSlugs: Record<string, string>;
};

function shouldUseBlobStorage(): boolean {
  if (process.env.CATALOG_RUNTIME_OVERLAY_ENABLED !== "1") return false;
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function emptyIndex(): CatalogOverlayIndex {
  return { updatedAt: new Date().toISOString(), ids: [], byPlatform: {}, seoSlugs: {} };
}

function parseIndex(raw: string): CatalogOverlayIndex {
  try {
    const parsed = JSON.parse(raw) as CatalogOverlayIndex;
    if (!parsed || !Array.isArray(parsed.ids)) return emptyIndex();
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      ids: parsed.ids,
      byPlatform: parsed.byPlatform ?? {},
      seoSlugs: parsed.seoSlugs ?? {},
    };
  } catch {
    return emptyIndex();
  }
}

async function readIndexFromBlobFresh(): Promise<CatalogOverlayIndex> {
  if (!shouldUseBlobStorage()) return emptyIndex();
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(INDEX_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return emptyIndex();
    const text = await new Response(result.stream).text();
    return parseIndex(text);
  } catch {
    return emptyIndex();
  }
}

const readIndexFromBlobCached = unstable_cache(
  readIndexFromBlobFresh,
  ["catalog-overlay-index"],
  { revalidate: 60, tags: [OVERLAY_CACHE_TAG] },
);

async function readIndexFromBlob(options?: { fresh?: boolean }): Promise<CatalogOverlayIndex> {
  return options?.fresh ? readIndexFromBlobFresh() : readIndexFromBlobCached();
}

async function writeIndexToBlob(index: CatalogOverlayIndex): Promise<void> {
  if (!shouldUseBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(INDEX_PATH, JSON.stringify({ ...index, updatedAt: new Date().toISOString() }, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  revalidateTag(OVERLAY_CACHE_TAG, { expire: 0 });
}

function gameBlobPath(catalogId: string): string {
  return `${OVERLAY_PREFIX}/games/${catalogId}.json`;
}

function detailsBlobPath(catalogId: string): string {
  return `${OVERLAY_PREFIX}/details/${catalogId}.json`;
}

export async function loadCatalogOverlayIndex(): Promise<CatalogOverlayIndex> {
  return readIndexFromBlob();
}

async function readCatalogOverlayGameFresh(catalogId: string): Promise<CatalogGame | null> {
  if (!shouldUseBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(gameBlobPath(catalogId), { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return normalizeCatalogGamePresentation(JSON.parse(text) as CatalogGame);
  } catch {
    return null;
  }
}

const readCatalogOverlayGameCached = unstable_cache(
  readCatalogOverlayGameFresh,
  ["catalog-overlay-game"],
  { revalidate: 60, tags: [OVERLAY_CACHE_TAG] },
);

export async function readCatalogOverlayGame(catalogId: string): Promise<CatalogGame | null> {
  return readCatalogOverlayGameCached(catalogId);
}

async function readCatalogOverlayDetailsFresh(catalogId: string): Promise<GameDetails | null> {
  if (!shouldUseBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(detailsBlobPath(catalogId), { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as GameDetails;
  } catch {
    return null;
  }
}

const readCatalogOverlayDetailsCached = unstable_cache(
  readCatalogOverlayDetailsFresh,
  ["catalog-overlay-details"],
  { revalidate: 60, tags: [OVERLAY_CACHE_TAG] },
);

export async function readCatalogOverlayDetails(catalogId: string): Promise<GameDetails | null> {
  return readCatalogOverlayDetailsCached(catalogId);
}

export async function writeCatalogOverlay(input: {
  game: CatalogGame;
  details: GameDetails;
}): Promise<{ ok: true } | { error: string }> {
  if (!shouldUseBlobStorage()) {
    return { error: "Blob no configurado; no se puede publicar en caliente." };
  }

  const auth = await blobAuthOptions("private");
  const gameJson = JSON.stringify(input.game, null, 2);
  const detailsJson = JSON.stringify(input.details, null, 2);

  await put(gameBlobPath(input.game.id), gameJson, {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  await put(detailsBlobPath(input.game.id), detailsJson, {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });

  const index = await readIndexFromBlob({ fresh: true });
  if (!index.ids.includes(input.game.id)) {
    index.ids.push(input.game.id);
    index.ids.sort();
  }
  const platform = input.game.platformSlug;
  const platformIds = new Set(index.byPlatform[platform] ?? []);
  platformIds.add(input.game.id);
  index.byPlatform[platform] = [...platformIds].sort();
  index.seoSlugs[buildCatalogSeoSlug(input.game)] = input.game.id;

  await writeIndexToBlob(index);
  revalidateTag(OVERLAY_CACHE_TAG, { expire: 0 });
  return { ok: true };
}

export async function deleteCatalogOverlayGame(
  catalogId: string,
): Promise<{ ok: true; removed: boolean } | { error: string }> {
  if (!shouldUseBlobStorage()) {
    return { ok: true, removed: false };
  }

  const auth = await blobAuthOptions("private");
  const game = await readCatalogOverlayGameFresh(catalogId);
  const index = await readIndexFromBlob({ fresh: true });
  const inIndex = index.ids.includes(catalogId);

  if (!game && !inIndex) {
    return { ok: true, removed: false };
  }

  try {
    await del([gameBlobPath(catalogId), detailsBlobPath(catalogId)], auth);
  } catch (error) {
    console.warn("[catalog-overlay] blob delete failed", catalogId, error);
  }

  index.ids = index.ids.filter((id) => id !== catalogId);

  if (game) {
    const platformIds = (index.byPlatform[game.platformSlug] ?? []).filter((id) => id !== catalogId);
    if (platformIds.length > 0) {
      index.byPlatform[game.platformSlug] = platformIds;
    } else {
      delete index.byPlatform[game.platformSlug];
    }
    delete index.seoSlugs[buildCatalogSeoSlug(game)];
  } else {
    for (const [slug, id] of Object.entries(index.seoSlugs)) {
      if (id === catalogId) delete index.seoSlugs[slug];
    }
  }

  await writeIndexToBlob(index);
  revalidateTag(OVERLAY_CACHE_TAG, { expire: 0 });
  return { ok: true, removed: true };
}

export async function catalogIdExistsInCatalog(catalogId: string): Promise<boolean> {
  if (getCatalogGame(catalogId)) return true;
  const index = await loadCatalogOverlayIndex();
  return index.ids.includes(catalogId);
}

export async function resolveCatalogGameWithOverlay(
  param: string,
): Promise<CatalogGame | undefined> {
  const staticGame =
    listedCatalog.find((g) => buildCatalogSeoSlug(g) === param) ?? getCatalogGame(param);
  const index = await loadCatalogOverlayIndex();
  const overlayId = resolveCatalogOverlayCandidate(
    param,
    staticGame,
    index.ids,
    index.seoSlugs,
  );
  if (overlayId) {
    const overlayGame = await readCatalogOverlayGame(overlayId);
    if (overlayGame) {
      const staticSource =
        staticGame?.id === overlayGame.id ? staticGame : getCatalogGame(overlayGame.id);
      return staticSource
        ? mergeCatalogGameWithOverlay(staticSource, overlayGame)
        : overlayGame;
    }
  }
  return staticGame;
}

export async function getGameDetailsWithOverlay(id: string): Promise<GameDetails | undefined> {
  const overlay = await readCatalogOverlayDetails(id);
  if (overlay) return normalizeGameDetailsPresentation(overlay);

  const platformSlug = getCatalogGame(id)?.platformSlug;
  const staticDetails = await getStaticGameDetails(id, platformSlug);
  const { getGameDetails } = await import("./indexes");
  const indexedDetails = getGameDetails(id);
  if (!staticDetails) return indexedDetails;
  if (!indexedDetails) return normalizeGameDetailsPresentation(staticDetails);

  return normalizeGameDetailsPresentation({
    ...indexedDetails,
    description: staticDetails.description ?? indexedDetails.description,
    descriptionMeta: staticDetails.descriptionMeta ?? indexedDetails.descriptionMeta,
    seoMeta: staticDetails.seoMeta ?? indexedDetails.seoMeta,
    videos: staticDetails.videos ?? indexedDetails.videos,
    ...("pegi" in staticDetails ? { pegi: (staticDetails as GameDetails & { pegi?: unknown }).pegi } : {}),
  });
}

export async function getCatalogByPlatformWithOverlay(platformSlug: string): Promise<CatalogGame[]> {
  const staticGames = listedCatalog.filter((g) => g.platformSlug === platformSlug);
  const index = await loadCatalogOverlayIndex();
  const overlayIds = index.byPlatform[platformSlug] ?? [];
  if (overlayIds.length === 0) return staticGames;

  const overlayGames = (
    await Promise.all(overlayIds.map((id) => readCatalogOverlayGame(id)))
  ).filter((g): g is CatalogGame => g != null);

  return mergeCatalogPlatformGames(platformSlug, staticGames, overlayGames);
}

export async function triggerCatalogDeployHook(): Promise<{ triggered: boolean; detail?: string }> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!hook) return { triggered: false, detail: "VERCEL_DEPLOY_HOOK_URL no configurada." };

  try {
    new URL(hook);
  } catch {
    return {
      triggered: false,
      detail: "VERCEL_DEPLOY_HOOK_URL no es una URL válida; publicación caliente guardada en Blob.",
    };
  }

  try {
    const res = await fetch(hook, { method: "POST" });
    if (!res.ok) {
      return { triggered: false, detail: `Deploy hook HTTP ${res.status}` };
    }
    return { triggered: true };
  } catch (error) {
    return {
      triggered: false,
      detail: error instanceof Error ? error.message : "Error al llamar deploy hook",
    };
  }
}

export function catalogOverlayEnabled(): boolean {
  return shouldUseBlobStorage();
}
