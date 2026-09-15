import { get } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import type { CatalogGame } from "./types";

const INDEX_PATH = "region-atlas/catalog/overlay/index.json";
const OVERLAY_CACHE_TAG = "catalog-overlay";

export type CatalogOverlayLiteIndex = {
  updatedAt: string;
  ids: string[];
};

function enabled(): boolean {
  return process.env.CATALOG_RUNTIME_OVERLAY_ENABLED === "1" && blobAuthConfigured();
}

function emptyIndex(): CatalogOverlayLiteIndex {
  return { updatedAt: "", ids: [] };
}

async function readIndexFresh(): Promise<CatalogOverlayLiteIndex> {
  if (!enabled()) return emptyIndex();
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(INDEX_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return emptyIndex();
    const parsed = JSON.parse(await new Response(result.stream).text()) as Partial<CatalogOverlayLiteIndex>;
    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return emptyIndex();
  }
}

const readIndexCached = unstable_cache(readIndexFresh, ["catalog-overlay-index-lite"], {
  revalidate: 60,
  tags: [OVERLAY_CACHE_TAG],
});

async function readGameFresh(catalogId: string): Promise<CatalogGame | null> {
  if (!enabled()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(`region-atlas/catalog/overlay/games/${catalogId}.json`, {
      ...auth,
      useCache: false,
    });
    if (!result?.stream || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text()) as CatalogGame;
  } catch {
    return null;
  }
}

const readGameCached = unstable_cache(readGameFresh, ["catalog-overlay-game-lite"], {
  revalidate: 60,
  tags: [OVERLAY_CACHE_TAG],
});

export async function getCatalogOverlayLiteSnapshot(): Promise<{
  revision: string;
  games: CatalogGame[];
}> {
  if (!enabled()) return { revision: "static", games: [] };
  const index = await readIndexCached();
  if (index.ids.length === 0) return { revision: "static", games: [] };
  const games = (await Promise.all(index.ids.map((id) => readGameCached(id))))
    .filter((game): game is CatalogGame => game != null);
  return {
    revision: `${index.updatedAt}:${index.ids.join("\u001f")}`,
    games,
  };
}
