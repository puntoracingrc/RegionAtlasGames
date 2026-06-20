import { getSiteUrl } from "./site-url";
import type { GameDetails } from "./types";

const DETAIL_CHUNK_PREFIX = "/catalog-details";
const DETAIL_BY_ID_PREFIX = `${DETAIL_CHUNK_PREFIX}/by-id`;

const platformDetailsCache = new Map<string, Promise<Record<string, GameDetails>>>();
const gameDetailsCache = new Map<string, Promise<GameDetails | undefined>>();

function detailAssetOrigin(): string {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  return vercelUrl ? `https://${vercelUrl.replace(/\/$/, "")}` : getSiteUrl();
}

function detailChunkUrl(platformSlug: string): string {
  const safePlatform = encodeURIComponent(platformSlug);
  const origin = detailAssetOrigin();
  return `${origin}${DETAIL_CHUNK_PREFIX}/${safePlatform}.json`;
}

function detailByIdUrl(catalogId: string): string {
  const safeCatalogId = encodeURIComponent(catalogId);
  const origin = detailAssetOrigin();
  return `${origin}${DETAIL_BY_ID_PREFIX}/${safeCatalogId}.json`;
}

async function readLocalDetailById(catalogId: string): Promise<GameDetails | undefined> {
  if (process.env.VERCEL) return undefined;

  try {
    const [{ readFile }, path] = await Promise.all([import("fs/promises"), import("path")]);
    const filePath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "catalog-details",
      "by-id",
      `${encodeURIComponent(catalogId)}.json`,
    );
    return JSON.parse(await readFile(filePath, "utf-8")) as GameDetails;
  } catch {
    return undefined;
  }
}

async function loadGameDetails(catalogId: string): Promise<GameDetails | undefined> {
  const existing = gameDetailsCache.get(catalogId);
  if (existing) return existing;

  const promise = readLocalDetailById(catalogId).then(async (localDetails) => {
    if (localDetails) return localDetails;

    return fetch(detailByIdUrl(catalogId), {
      next: { revalidate: 3600 },
    })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return (await response.json()) as GameDetails;
      })
      .catch(() => undefined);
  });

  gameDetailsCache.set(catalogId, promise);
  return promise;
}

async function loadPlatformDetails(platformSlug: string): Promise<Record<string, GameDetails>> {
  const existing = platformDetailsCache.get(platformSlug);
  if (existing) return existing;

  const promise = fetch(detailChunkUrl(platformSlug), {
    next: { revalidate: 3600 },
  })
    .then(async (response) => {
      if (!response.ok) return {};
      return (await response.json()) as Record<string, GameDetails>;
    })
    .catch(() => ({}));

  platformDetailsCache.set(platformSlug, promise);
  return promise;
}

export async function getStaticGameDetails(
  catalogId: string,
  platformSlug?: string,
): Promise<GameDetails | undefined> {
  const gameDetails = await loadGameDetails(catalogId);
  if (gameDetails) return gameDetails;

  if (!platformSlug) return undefined;
  const platformDetails = await loadPlatformDetails(platformSlug);
  return platformDetails[catalogId];
}
