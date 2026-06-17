import { getSiteUrl } from "./site-url";
import type { GameDetails } from "./types";

const DETAIL_CHUNK_PREFIX = "/catalog-details";

const platformDetailsCache = new Map<string, Promise<Record<string, GameDetails>>>();

function detailChunkUrl(platformSlug: string): string {
  const safePlatform = encodeURIComponent(platformSlug);
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const origin = vercelUrl ? `https://${vercelUrl.replace(/\/$/, "")}` : getSiteUrl();
  return `${origin}${DETAIL_CHUNK_PREFIX}/${safePlatform}.json`;
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
  platformSlug: string | undefined,
): Promise<GameDetails | undefined> {
  if (!platformSlug) return undefined;
  const platformDetails = await loadPlatformDetails(platformSlug);
  return platformDetails[catalogId];
}
