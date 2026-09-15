import { getPlatform } from "./catalog";
import type { PlatformHistory } from "./platform-history-types";
import type { Platform } from "./types";

export function getPlatformHistoryPresentation(
  history: PlatformHistory,
): Platform | undefined {
  const catalogPlatform = getPlatform(history.platformSlug);
  if (catalogPlatform) return catalogPlatform;

  const identity = history.editorialIdentity;
  if (!identity) return undefined;

  return {
    slug: history.platformSlug,
    name: history.title,
    shortName: identity.shortName,
    manufacturer: identity.manufacturer,
    status: identity.status,
    estimatedCatalogSize: 0,
    sortOrder: identity.sortOrder,
    releaseYear: identity.releaseYear ?? undefined,
    description: identity.descriptionEs,
    active: false,
    newsEnabled: false,
  };
}

export function isCatalogBackedPlatformHistory(history: PlatformHistory): boolean {
  return Boolean(getPlatform(history.platformSlug));
}
