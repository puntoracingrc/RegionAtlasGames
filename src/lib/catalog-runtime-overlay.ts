import { del, get, put } from "@vercel/blob";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { buildCatalogSeoSlug } from "./catalog-url";
import {
  getCatalogGame,
  isPublicCatalogGame,
  listedCatalog,
  publicListedCatalog,
} from "./catalog";
import { canonicalCatalogId } from "./catalog-id-aliases";
import { withReviewedCatalogOverride } from "./catalog-reviewed-overrides";
import {
  mergeCatalogGameWithOverlay,
  mergeCatalogPlatformGames,
  mergeVerifiedCompanyCredits,
  resolveCatalogOverlayCandidate,
} from "./catalog-overlay-merge";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { blobReadPathname } from "./blob-read-pathname";
import {
  mutateOverlayGame,
  mutateOverlayIndex,
  overlayTitlePlatformKey,
  overlayWorkKey,
  registerOverlayGame,
  type OverlayIndexDocument,
} from "./catalog-overlay-documents";
import { preserveDirectPriceReceipts } from "./direct-price-connector";
import { getStaticGameDetails } from "./static-game-details";
import { withOwnedScanDetails } from "./catalog-owned-scans";
import { getPs1EditionDetails } from "./ps1-edition-data";
import { getPs2EditionDetails } from "./ps2-edition-data";
import { getVerifiedCompanyCreditDetails } from "./verified-company-credits";
import { getCatalogEditionGuide } from "./catalog-edition-guides";
import {
  normalizeCatalogGamePresentation,
  normalizeGameDetailsPresentation,
} from "./catalog-presentation";
import type { CatalogGame, GameDetails } from "./types";
import { loadCatalogPriceGames } from "./catalog-price-games";

const OVERLAY_PREFIX = "region-atlas/catalog/overlay";
const INDEX_PATH = `${OVERLAY_PREFIX}/index.json`;
const OVERLAY_CACHE_TAG = "catalog-overlay";
const CATALOG_DETAIL_ROUTE_PATTERN = "/catalogo/[slug]";
const OVERLAY_CACHE_VERSION = "v2";

export function catalogOverlayRevalidationPaths(game: CatalogGame): string[] {
  return [
    `/api/catalog/platform/${game.platformSlug}`,
    "/api/catalog/search",
    `/plataforma/${game.platformSlug}`,
    `/catalogo/${buildCatalogSeoSlug(game)}`,
    CATALOG_DETAIL_ROUTE_PATTERN,
  ];
}

function revalidateCatalogOverlayPaths(game: CatalogGame): void {
  for (const path of catalogOverlayRevalidationPaths(game)) {
    if (path === CATALOG_DETAIL_ROUTE_PATTERN) revalidatePath(path, "page");
    else revalidatePath(path);
  }
}

export function revalidateCatalogOverlayGame(game: CatalogGame): void {
  revalidateTag(OVERLAY_CACHE_TAG, { expire: 0 });
  revalidateCatalogOverlayPaths(game);
}

export type CatalogOverlayIndex = OverlayIndexDocument;

function shouldUseBlobStorage(): boolean {
  if (process.env.CATALOG_RUNTIME_OVERLAY_ENABLED !== "1") return false;
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function emptyIndex(): CatalogOverlayIndex {
  return {
    updatedAt: new Date().toISOString(),
    ids: [],
    byPlatform: {},
    byWork: {},
    byTitlePlatform: {},
    seoSlugs: {},
  };
}

function parseIndex(raw: string): CatalogOverlayIndex {
  try {
    const parsed = JSON.parse(raw) as CatalogOverlayIndex;
    if (!parsed || !Array.isArray(parsed.ids)) return emptyIndex();
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      ids: parsed.ids,
      byPlatform: parsed.byPlatform ?? {},
      byWork: parsed.byWork ?? {},
      byTitlePlatform: parsed.byTitlePlatform ?? {},
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
    const result = await get(blobReadPathname(INDEX_PATH), { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return emptyIndex();
    const text = await new Response(result.stream).text();
    return parseIndex(text);
  } catch {
    return emptyIndex();
  }
}

const readIndexFromBlobCached = unstable_cache(
  readIndexFromBlobFresh,
  [`catalog-overlay-index-${OVERLAY_CACHE_VERSION}`],
  { revalidate: 60, tags: [OVERLAY_CACHE_TAG] },
);

async function readIndexFromBlob(options?: { fresh?: boolean }): Promise<CatalogOverlayIndex> {
  return options?.fresh ? readIndexFromBlobFresh() : readIndexFromBlobCached();
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

export function catalogOverlayRevision(index: CatalogOverlayIndex): string {
  return index.ids.length ? `${index.updatedAt}:${index.ids.join("\u001f")}` : "static";
}

export async function getCatalogOverlayRevision(): Promise<string> {
  return catalogOverlayRevision(await loadCatalogOverlayIndex());
}

async function readCatalogOverlayGameFresh(catalogId: string): Promise<CatalogGame | null> {
  if (!shouldUseBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(blobReadPathname(gameBlobPath(catalogId)), { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return normalizeCatalogGamePresentation(JSON.parse(text) as CatalogGame);
  } catch {
    return null;
  }
}

const readCatalogOverlayGameCached = unstable_cache(
  readCatalogOverlayGameFresh,
  [`catalog-overlay-game-${OVERLAY_CACHE_VERSION}`],
  { revalidate: 60, tags: [OVERLAY_CACHE_TAG] },
);

export async function readCatalogOverlayGame(catalogId: string): Promise<CatalogGame | null> {
  return readCatalogOverlayGameCached(catalogId);
}

async function readCatalogOverlayDetailsFresh(catalogId: string): Promise<GameDetails | null> {
  if (!shouldUseBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(blobReadPathname(detailsBlobPath(catalogId)), { ...auth, useCache: false });
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
  const detailsJson = JSON.stringify(input.details, null, 2);

  await mutateOverlayGame(input.game.id, current => ({
    next: preserveDirectPriceReceipts(current, input.game), result: undefined,
  }));
  await put(detailsBlobPath(input.game.id), detailsJson, {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });

  await registerOverlayGame(input.game);
  revalidateCatalogOverlayGame(input.game);
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

  await mutateOverlayIndex(current => ({
    ...current,
    ids: current.ids.filter(id => id !== catalogId),
    byPlatform: Object.fromEntries(Object.entries(current.byPlatform).map(([platform, ids]) => [platform, ids.filter(id => id !== catalogId)]).filter(([, ids]) => ids.length > 0)),
    byWork: Object.fromEntries(Object.entries(current.byWork ?? {}).map(([work, ids]) => [work, ids.filter(id => id !== catalogId)]).filter(([, ids]) => ids.length > 0)),
    byTitlePlatform: Object.fromEntries(Object.entries(current.byTitlePlatform ?? {}).map(([title, ids]) => [title, ids.filter(id => id !== catalogId)]).filter(([, ids]) => ids.length > 0)),
    seoSlugs: Object.fromEntries(Object.entries(current.seoSlugs).filter(([, id]) => id !== catalogId)),
  }));
  revalidateTag(OVERLAY_CACHE_TAG, { expire: 0 });
  if (game) revalidateCatalogOverlayPaths(game);
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
    getCatalogGame(param) ?? listedCatalog.find((g) => buildCatalogSeoSlug(g) === param);
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
  const game = getCatalogGame(id);
  const details = await getGameDetailsOverlaySource(game?.id ?? id);
  return game ? withOwnedScanDetails(game, details) : details;
}

export function resolveCatalogGameDetailsCatalogId(game: CatalogGame): string {
  const guide = getCatalogEditionGuide(game);
  return guide?.schemaVersion === 2 ? guide.game.canonicalCatalogId : game.id;
}

/**
 * Las fichas V2 comparten los datos del videojuego, pero conservan la evidencia
 * física (referencia, EAN y scans) de la edición que se está viendo.
 */
export async function getCatalogGameDetailsWithOverlay(
  game: CatalogGame,
): Promise<GameDetails | undefined> {
  const detailsCatalogId = resolveCatalogGameDetailsCatalogId(game);
  const details = await getGameDetailsWithOverlay(detailsCatalogId);
  return detailsCatalogId === game.id ? details : withOwnedScanDetails(game, details);
}

async function getGameDetailsOverlaySource(id: string): Promise<GameDetails | undefined> {
  const verifiedDetails = getVerifiedCompanyCreditDetails(id);
  const overlay = await readCatalogOverlayDetails(id);
  if (overlay) {
    const ps1Edition = getPs1EditionDetails(id);
    const ps2Edition = getPs2EditionDetails(id);
    const game = ps1Edition || ps2Edition ? getCatalogGame(id) : undefined;
    const current = (ps1Edition || ps2Edition) && game ? {
      ...overlay,
      ...(ps1Edition ? { ps1Edition } : { ps2Edition }),
      reference: game.regionalStatus === "resolved" ? game.canonicalSerials?.join(" / ") ?? null : null,
    } : overlay;
    return normalizeGameDetailsPresentation(
      verifiedDetails ? mergeVerifiedCompanyCredits(verifiedDetails, current) : current,
    );
  }

  const platformSlug = getCatalogGame(id)?.platformSlug;
  const staticDetails = await getStaticGameDetails(id, platformSlug);
  const { getGameDetails } = await import("./indexes");
  const indexedDetails = getGameDetails(id);
  const staticSource = !staticDetails
    ? indexedDetails
    : !indexedDetails
      ? staticDetails
      : {
          ...indexedDetails,
          description: staticDetails.description ?? indexedDetails.description,
          descriptionMeta: staticDetails.descriptionMeta ?? indexedDetails.descriptionMeta,
          seoMeta: staticDetails.seoMeta ?? indexedDetails.seoMeta,
          videos: staticDetails.videos ?? indexedDetails.videos,
          ...("pegi" in staticDetails
            ? { pegi: (staticDetails as GameDetails & { pegi?: unknown }).pegi }
            : {}),
        };

  if (!verifiedDetails) {
    return staticSource ? normalizeGameDetailsPresentation(staticSource) : undefined;
  }
  return normalizeGameDetailsPresentation(
    mergeVerifiedCompanyCredits(verifiedDetails, staticSource),
  );
}

export async function getCatalogByPlatformWithOverlay(platformSlug: string): Promise<CatalogGame[]> {
  const staticGames = listedCatalog.filter((g) => g.platformSlug === platformSlug);
  const index = await loadCatalogOverlayIndex();
  const overlayIds = index.byPlatform[platformSlug] ?? [];
  if (overlayIds.length === 0) return staticGames;

  const overlayGames = Object.values(await loadCatalogPriceGames(
    overlayIds, async id => (await readCatalogOverlayGame(id)) ?? undefined,
  )).filter((g): g is CatalogGame => g != null);

  return mergeCatalogPlatformGames(platformSlug, staticGames, overlayGames);
}

/**
 * Detail pages only need the current work, not every runtime publication on the
 * platform. The lightweight overlay index keeps that request bounded after a
 * cache invalidation, while exact-title fallback preserves reviewed legacy rows.
 */
export async function getCatalogFamilyWithOverlay(game: CatalogGame): Promise<CatalogGame[]> {
  const titleKey = overlayTitlePlatformKey(game);
  const workKey = overlayWorkKey(game);
  const staticGames = listedCatalog.filter((candidate) => (
    candidate.platformSlug === game.platformSlug
    && (
      (workKey != null && overlayWorkKey(candidate) === workKey)
      || overlayTitlePlatformKey(candidate) === titleKey
    )
  ));
  const index = await loadCatalogOverlayIndex();
  const overlayIds = [...new Set([
    ...(workKey ? (index.byWork?.[workKey] ?? []) : []),
    ...(index.byTitlePlatform?.[titleKey] ?? []),
    ...(index.ids.includes(game.id) ? [game.id] : []),
  ])];
  if (overlayIds.length === 0) return staticGames.length ? staticGames : [game];

  const overlayGames = Object.values(await loadCatalogPriceGames(
    overlayIds,
    async id => (await readCatalogOverlayGame(id)) ?? undefined,
  )).filter((candidate): candidate is CatalogGame => candidate != null);

  return mergeCatalogPlatformGames(game.platformSlug, staticGames, overlayGames);
}

/** Catálogo público completo, incluida la publicación caliente del worker. */
export async function getPublicCatalogWithOverlay(): Promise<CatalogGame[]> {
  const index = await loadCatalogOverlayIndex();
  if (index.ids.length === 0) return publicListedCatalog;

  const overlayGames = Object.values(await loadCatalogPriceGames(
    index.ids, async id => (await readCatalogOverlayGame(id)) ?? undefined,
  )).filter((game): game is CatalogGame => game != null && canonicalCatalogId(game.id) === game.id);
  if (overlayGames.length === 0) return publicListedCatalog;

  return mergePublicCatalogWithOverlayGames(publicListedCatalog, overlayGames);
}

export function mergePublicCatalogWithOverlayGames(
  staticGames: readonly CatalogGame[],
  overlayGames: readonly CatalogGame[],
): CatalogGame[] {
  const overlaysById = new Map(overlayGames.map((game) => [game.id, game]));
  const seen = new Set<string>();
  const merged = staticGames.flatMap((staticGame) => {
    const overlay = overlaysById.get(staticGame.id);
    const game = overlay ? mergeCatalogGameWithOverlay(staticGame, overlay) : staticGame;
    seen.add(game.id);
    return isPublicCatalogGame(game) ? [game] : [];
  });
  for (const overlay of overlayGames) {
    if (!seen.has(overlay.id) && isPublicCatalogGame(overlay)) {
      merged.push(withReviewedCatalogOverride(overlay));
    }
  }
  return merged;
}

export const CATALOG_DEPLOY_HOOK_TIMEOUT_MS = 5_000;

export function catalogDeployHookRequestInit(): RequestInit {
  return {
    method: "POST",
    signal: AbortSignal.timeout(CATALOG_DEPLOY_HOOK_TIMEOUT_MS),
  };
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
    // The hot catalog overlay is already durable before this best-effort hook runs.
    // Never keep the Admin request open indefinitely when Vercel does not answer.
    const res = await fetch(hook, catalogDeployHookRequestInit());
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
