import type { CollectionItem } from "./types";
import type {
  CatalogStagingGame,
  CatalogStagingIndex,
  CatalogStagingUpsertResult,
  StagingImportCandidate,
} from "./catalog-staging-types";
import {
  readCatalogStagingGame,
  readCatalogStagingIndex,
  rebuildPlatformStats,
  trackUserId,
  writeCatalogStagingGame,
  writeCatalogStagingIndex,
  catalogStagingStorageBackend,
} from "./catalog-staging-storage";
import { catalogIdFromStaging, guessPcPath } from "./pc-path-guess";

export function stagingCandidatesFromCollection(items: CollectionItem[]): StagingImportCandidate[] {
  return items
    .filter((item) => !item.catalogMatched && item.pcImportId != null)
    .map((item) => ({
      pcImportId: item.pcImportId as number,
      title: item.title,
      titlePc: item.titlePc ?? null,
      platformSlug: item.platformSlug,
      consoleName: item.consoleName ?? null,
      region: item.region,
      inRetroCatalog: item.inRetroCatalog,
      quantity: item.quantity,
      pcRefPrice: item.pcRefPrice,
      recommendedPrice: item.recommendedPrice,
      marketMin: item.marketMin,
      marketMax: item.marketMax,
    }));
}

function mergeGame(
  existing: CatalogStagingGame | null,
  candidate: StagingImportCandidate,
  userId: string,
  importedAt: string,
): CatalogStagingGame {
  const guess = guessPcPath({
    platformSlug: candidate.platformSlug,
    region: candidate.region,
    title: candidate.title,
    titlePc: candidate.titlePc,
  });

  if (!existing) {
    const { userIds, isNew } = trackUserId([], userId);
    return {
      pcId: candidate.pcImportId,
      title: candidate.title,
      titlePc: candidate.titlePc,
      platformSlug: candidate.platformSlug,
      consoleName: candidate.consoleName,
      region: candidate.region,
      inRetroCatalog: candidate.inRetroCatalog,
      status: "pending-catalog",
      pcPath: null,
      pcPathGuess: guess.pcPath,
      pcRegion: guess.pcRegion,
      coverUrl: null,
      coverSourceUrl: null,
      pcRefPrice: candidate.pcRefPrice,
      recommendedPrice: candidate.recommendedPrice,
      marketMin: candidate.marketMin,
      marketMax: candidate.marketMax,
      firstSeenAt: importedAt,
      lastSeenAt: importedAt,
      importCount: 1,
      userCount: isNew ? 1 : 0,
      unitCount: candidate.quantity,
      userIds,
      enrichedAt: null,
      enrichError: null,
      catalogId: guess.slug ? catalogIdFromStaging({ platformSlug: candidate.platformSlug, slug: guess.slug }) : null,
      promotedAt: null,
    };
  }

  const { userIds, isNew } = trackUserId(existing.userIds, userId);
  return {
    ...existing,
    title: candidate.title || existing.title,
    titlePc: candidate.titlePc ?? existing.titlePc,
    consoleName: candidate.consoleName ?? existing.consoleName,
    region: candidate.region || existing.region,
    inRetroCatalog: existing.inRetroCatalog || candidate.inRetroCatalog,
    pcPathGuess: existing.pcPathGuess ?? guess.pcPath,
    pcRegion: existing.pcRegion ?? guess.pcRegion,
    pcRefPrice: candidate.pcRefPrice ?? existing.pcRefPrice,
    recommendedPrice: candidate.recommendedPrice ?? existing.recommendedPrice,
    marketMin: candidate.marketMin ?? existing.marketMin,
    marketMax: candidate.marketMax ?? existing.marketMax,
    lastSeenAt: importedAt,
    importCount: existing.importCount + 1,
    userCount: existing.userCount + (isNew ? 1 : 0),
    unitCount: existing.unitCount + candidate.quantity,
    userIds,
    catalogId:
      existing.catalogId ??
      (guess.slug ? catalogIdFromStaging({ platformSlug: candidate.platformSlug, slug: guess.slug }) : null),
  };
}

function upsertIndexPcId(index: CatalogStagingIndex, pcId: number): CatalogStagingIndex {
  if (index.pcIds.includes(pcId)) return index;
  return {
    ...index,
    pcIds: [...index.pcIds, pcId].sort((a, b) => a - b),
  };
}

export async function upsertCatalogStagingFromImport(input: {
  userId: string;
  items: CollectionItem[];
  importedAt?: string;
}): Promise<CatalogStagingUpsertResult> {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const candidates = stagingCandidatesFromCollection(input.items);
  const result: CatalogStagingUpsertResult = {
    upserted: 0,
    created: 0,
    updated: 0,
    skippedNoPcId: input.items.filter((i) => !i.catalogMatched && i.pcImportId == null).length,
    skippedMatched: input.items.filter((i) => i.catalogMatched).length,
    totalQueued: 0,
  };

  if (candidates.length === 0) {
    const index = await readCatalogStagingIndex();
    result.totalQueued = index.pcIds.length;
    return result;
  }

  let index = await readCatalogStagingIndex();
  const touched: CatalogStagingGame[] = [];

  for (const candidate of candidates) {
    const existing = await readCatalogStagingGame(candidate.pcImportId);
    const merged = mergeGame(existing, candidate, input.userId, importedAt);
    const saved = await writeCatalogStagingGame(merged);
    if ("error" in saved) continue;

    index = upsertIndexPcId(index, merged.pcId);
    touched.push(merged);
    result.upserted += 1;
    if (existing) result.updated += 1;
    else result.created += 1;
  }

  const allGames = await Promise.all(index.pcIds.map((pcId) => readCatalogStagingGame(pcId)));
  const games = allGames.filter((game): game is CatalogStagingGame => Boolean(game));
  index.byPlatform = rebuildPlatformStats(games.length > 0 ? games : touched);
  await writeCatalogStagingIndex(index);
  result.totalQueued = index.pcIds.length;
  return result;
}

export async function getCatalogStagingSummary(limit = 12) {
  const index = await readCatalogStagingIndex();
  const games = await Promise.all(index.pcIds.map((pcId) => readCatalogStagingGame(pcId)));
  const valid = games.filter((game): game is CatalogStagingGame => Boolean(game));
  const topByUnits = [...valid]
    .sort((a, b) => b.unitCount - a.unitCount || b.userCount - a.userCount)
    .slice(0, limit)
    .map((game) => ({
      pcId: game.pcId,
      platformSlug: game.platformSlug,
      title: game.title,
      unitCount: game.unitCount,
      userCount: game.userCount,
      status: game.status,
    }));

  return {
    updatedAt: index.updatedAt,
    totalGames: index.pcIds.length,
    byPlatform: index.byPlatform,
    topByUnits,
    backend: catalogStagingStorageBackend(),
  };
}
