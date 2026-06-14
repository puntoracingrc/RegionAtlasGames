import { get, put } from "@vercel/blob";
import { cache } from "react";
import { buildCatalogSeoSlug } from "./catalog-url";
import { getCatalogGame, listedCatalog } from "./catalog";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import type { CatalogGame, GameDetails } from "./types";

const OVERLAY_PREFIX = "region-atlas/catalog/overlay";
const INDEX_PATH = `${OVERLAY_PREFIX}/index.json`;

export type CatalogOverlayIndex = {
  updatedAt: string;
  ids: string[];
  byPlatform: Record<string, string[]>;
  seoSlugs: Record<string, string>;
};

function useBlobStorage(): boolean {
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

async function readIndexFromBlob(): Promise<CatalogOverlayIndex> {
  if (!useBlobStorage()) return emptyIndex();
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(INDEX_PATH, auth);
    if (!result?.stream || result.statusCode !== 200) return emptyIndex();
    const text = await new Response(result.stream).text();
    return parseIndex(text);
  } catch {
    return emptyIndex();
  }
}

async function writeIndexToBlob(index: CatalogOverlayIndex): Promise<void> {
  if (!useBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(INDEX_PATH, JSON.stringify({ ...index, updatedAt: new Date().toISOString() }, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function gameBlobPath(catalogId: string): string {
  return `${OVERLAY_PREFIX}/games/${catalogId}.json`;
}

function detailsBlobPath(catalogId: string): string {
  return `${OVERLAY_PREFIX}/details/${catalogId}.json`;
}

export const loadCatalogOverlayIndex = cache(async (): Promise<CatalogOverlayIndex> => {
  return readIndexFromBlob();
});

export async function readCatalogOverlayGame(catalogId: string): Promise<CatalogGame | null> {
  if (!useBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(gameBlobPath(catalogId), auth);
    if (!result?.stream || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as CatalogGame;
  } catch {
    return null;
  }
}

export async function readCatalogOverlayDetails(catalogId: string): Promise<GameDetails | null> {
  if (!useBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(detailsBlobPath(catalogId), auth);
    if (!result?.stream || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as GameDetails;
  } catch {
    return null;
  }
}

export async function writeCatalogOverlay(input: {
  game: CatalogGame;
  details: GameDetails;
}): Promise<{ ok: true } | { error: string }> {
  if (!useBlobStorage()) {
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
  });
  await put(detailsBlobPath(input.game.id), detailsJson, {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const index = await readIndexFromBlob();
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
  return { ok: true };
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
  if (staticGame) return staticGame;

  const index = await loadCatalogOverlayIndex();
  const catalogId = index.seoSlugs[param];
  if (!catalogId) return undefined;
  return (await readCatalogOverlayGame(catalogId)) ?? undefined;
}

export async function getGameDetailsWithOverlay(id: string): Promise<GameDetails | undefined> {
  const overlay = await readCatalogOverlayDetails(id);
  if (overlay) return overlay;

  const { getGameDetails } = await import("./indexes");
  return getGameDetails(id);
}

export async function getCatalogByPlatformWithOverlay(platformSlug: string): Promise<CatalogGame[]> {
  const staticGames = listedCatalog.filter((g) => g.platformSlug === platformSlug);
  const index = await loadCatalogOverlayIndex();
  const overlayIds = index.byPlatform[platformSlug] ?? [];
  if (overlayIds.length === 0) return staticGames;

  const staticIds = new Set(staticGames.map((g) => g.id));
  const overlayGames = (
    await Promise.all(overlayIds.map((id) => readCatalogOverlayGame(id)))
  ).filter((g): g is CatalogGame => g != null && !staticIds.has(g.id));

  return [...staticGames, ...overlayGames].sort((a, b) =>
    a.title.localeCompare(b.title, "es"),
  );
}

export async function triggerCatalogDeployHook(): Promise<{ triggered: boolean; detail?: string }> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!hook) return { triggered: false, detail: "VERCEL_DEPLOY_HOOK_URL no configurada." };

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
  return useBlobStorage();
}
