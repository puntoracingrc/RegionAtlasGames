import type { CatalogStagingGame } from "./catalog-staging-types";
import {
  applyCatalogStagingGameTransition,
  findCatalogStagingEnrichmentTargets,
  readCatalogStagingGame,
  readCatalogStagingIndex,
  writeCatalogStagingGame,
  writeCatalogStagingIndex,
} from "./catalog-staging-storage";
import { enrichStagingGameFromPriceCharting } from "./pricecharting-enrich";

export type CatalogStagingEnrichResult = {
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  scanned: number;
  attempted: number;
  enriched: number;
  failed: number;
  stoppedByBudget: boolean;
  errors: Array<{ pcId: number; error: string }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichCatalogStagingBatch(input?: {
  limit?: number;
  delayMs?: number;
  budgetMs?: number;
  scanLimit?: number;
  fetchTimeoutMs?: number;
}): Promise<CatalogStagingEnrichResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const budgetMs = Math.min(50_000, Math.max(5_000, input?.budgetMs ?? 45_000));
  const deadlineMs = startedMs + budgetMs;
  const limit = Math.min(8, Math.max(1, input?.limit ?? 4));
  const delayMs = Math.min(2_000, Math.max(0, input?.delayMs ?? 250));
  const selection = await findCatalogStagingEnrichmentTargets({
    limit,
    maxScan: input?.scanLimit ?? 96,
  });

  const result: CatalogStagingEnrichResult = {
    startedAt,
    completedAt: startedAt,
    elapsedMs: 0,
    scanned: selection.scanned,
    attempted: 0,
    enriched: 0,
    failed: 0,
    stoppedByBudget: false,
    errors: [],
  };
  const transitions: Array<{ before: CatalogStagingGame; after: CatalogStagingGame }> = [];

  for (const [position, game] of selection.targets.entries()) {
    if (Date.now() >= deadlineMs) {
      result.stoppedByBudget = true;
      break;
    }

    result.attempted += 1;
    const enriched = await enrichStagingGameFromPriceCharting(game, {
      timeoutMs: input?.fetchTimeoutMs ?? 8_000,
      deadlineMs,
    });
    const saved = await writeCatalogStagingGame(enriched);
    if ("error" in saved) throw new Error(saved.error);
    transitions.push({ before: game, after: enriched });

    if (enriched.status === "enriched" && enriched.enrichedAt) {
      result.enriched += 1;
    } else {
      result.failed += 1;
      result.errors.push({
        pcId: enriched.pcId,
        error: enriched.enrichError ?? "unknown",
      });
    }

    if (position < selection.targets.length - 1 && delayMs > 0) {
      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) result.stoppedByBudget = true;
      else await sleep(Math.min(delayMs, remaining));
    }
  }

  if (result.attempted < selection.targets.length) result.stoppedByBudget = true;
  result.completedAt = new Date().toISOString();
  result.elapsedMs = Date.now() - startedMs;

  const index = await readCatalogStagingIndex({ fresh: true });
  index.enrichmentCursor = selection.nextCursor;
  for (const { before, after } of transitions) {
    applyCatalogStagingGameTransition(index, before, after);
  }
  index.lastEnrichmentRun = {
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    elapsedMs: result.elapsedMs,
    scanned: result.scanned,
    attempted: result.attempted,
    enriched: result.enriched,
    failed: result.failed,
    stoppedByBudget: result.stoppedByBudget,
  };
  const indexSaved = await writeCatalogStagingIndex(index);
  if ("error" in indexSaved) throw new Error(indexSaved.error);

  return result;
}

export async function markStagingGamePromoted(
  pcId: number,
  catalogId: string,
): Promise<CatalogStagingGame | null> {
  const game = await readCatalogStagingGame(pcId, { fresh: true });
  if (!game) return null;

  const promoted: CatalogStagingGame = {
    ...game,
    status: "promoted",
    catalogId,
    promotedAt: new Date().toISOString(),
  };
  const saved = await writeCatalogStagingGame(promoted);
  if ("error" in saved) throw new Error(saved.error);

  const index = await readCatalogStagingIndex({ fresh: true });
  applyCatalogStagingGameTransition(index, game, promoted);
  const indexSaved = await writeCatalogStagingIndex(index);
  if ("error" in indexSaved) throw new Error(indexSaved.error);
  return promoted;
}
