import syncStateData from "../../data/price-sync-state.json";

export type PlatformPriceSync = {
  lastSyncAt: string | null;
  source: string | null;
  gamesTargeted: number;
  gamesUpdated: number;
  gamesSkippedNoData: number;
  gamesRejectedOutliers: number;
  gamesRejectedUnverifiedRegion?: number;
  gamesRejectedRegionMismatch?: number;
  gamesRejectedInsufficientEvidence?: number;
  cexGamesUpdated?: number;
  cexGamesSkipped?: number;
  jgoGamesUpdated?: number;
  jgoGamesSkipped?: number;
  cholloGamesUpdated?: number;
  cholloGamesSkipped?: number;
  kaotoGamesUpdated?: number;
  kaotoGamesSkipped?: number;
  coveragePct: number;
  regionPolicy?: string;
};

export type PriceSyncState = {
  rotationOrder: string[];
  lastRunAt: string | null;
  nextPlatformSlug: string | null;
  platforms: Record<string, PlatformPriceSync>;
};

const state = syncStateData as PriceSyncState;

export function getPriceSyncState(): PriceSyncState {
  return state;
}

export function getPlatformPriceSync(platformSlug: string): PlatformPriceSync | null {
  return state.platforms[platformSlug] ?? null;
}

export function formatPriceSyncDate(iso: string | null): string {
  if (!iso) return "Sin actualizar";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
