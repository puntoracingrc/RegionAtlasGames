import type { CatalogStagingGame } from "./catalog-staging-types";
import {
  listCatalogStagingGames,
  readCatalogStagingGame,
  readCatalogStagingIndex,
  rebuildPlatformStats,
  writeCatalogStagingGame,
  writeCatalogStagingIndex,
} from "./catalog-staging-storage";
import {
  enrichStagingGameFromPriceCharting,
  pickStagingGamesForEnrichment,
} from "./pricecharting-enrich";

export type CatalogStagingEnrichResult = {
  attempted: number;
  enriched: number;
  failed: number;
  errors: Array<{ pcId: number; error: string }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichCatalogStagingBatch(input?: {
  limit?: number;
  delayMs?: number;
}): Promise<CatalogStagingEnrichResult> {
  const limit = input?.limit ?? 12;
  const delayMs = input?.delayMs ?? 900;
  const allGames = await listCatalogStagingGames();
  const targets = pickStagingGamesForEnrichment(allGames, limit);

  const result: CatalogStagingEnrichResult = {
    attempted: targets.length,
    enriched: 0,
    failed: 0,
    errors: [],
  };

  for (const game of targets) {
    const enriched = await enrichStagingGameFromPriceCharting(game);
    await writeCatalogStagingGame(enriched);

    if (enriched.status === "enriched" && enriched.enrichedAt) {
      result.enriched += 1;
    } else {
      result.failed += 1;
      result.errors.push({
        pcId: enriched.pcId,
        error: enriched.enrichError ?? "unknown",
      });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const index = await readCatalogStagingIndex();
  const games = await listCatalogStagingGames();
  index.byPlatform = rebuildPlatformStats(games);
  await writeCatalogStagingIndex(index);

  return result;
}

export async function markStagingGamePromoted(
  pcId: number,
  catalogId: string,
): Promise<CatalogStagingGame | null> {
  const game = await readCatalogStagingGame(pcId);
  if (!game) return null;

  const promoted: CatalogStagingGame = {
    ...game,
    status: "promoted",
    catalogId,
    promotedAt: new Date().toISOString(),
  };
  await writeCatalogStagingGame(promoted);

  const index = await readCatalogStagingIndex();
  const games = await listCatalogStagingGames();
  index.byPlatform = rebuildPlatformStats(games);
  await writeCatalogStagingIndex(index);
  return promoted;
}
