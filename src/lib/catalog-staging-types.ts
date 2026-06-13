export type CatalogStagingStatus = "pending-catalog" | "enriched" | "promoted";

export type CatalogStagingGame = {
  pcId: number;
  title: string;
  titlePc: string | null;
  platformSlug: string;
  consoleName: string | null;
  region: string;
  inRetroCatalog: boolean;
  status: CatalogStagingStatus;
  pcPath: string | null;
  pcPathGuess: string | null;
  pcRegion: string | null;
  coverUrl: string | null;
  coverSourceUrl: string | null;
  pcRefPrice: number | null;
  recommendedPrice: number | null;
  marketMin: number | null;
  marketMax: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  importCount: number;
  userCount: number;
  unitCount: number;
  userIds: string[];
  enrichedAt: string | null;
  enrichError: string | null;
  catalogId: string | null;
  promotedAt: string | null;
};

export type CatalogStagingPlatformStats = {
  games: number;
  units: number;
  pendingEnrich: number;
  enriched: number;
  promoted: number;
};

export type CatalogStagingIndex = {
  updatedAt: string;
  pcIds: number[];
  byPlatform: Record<string, CatalogStagingPlatformStats>;
};

export type CatalogStagingUpsertResult = {
  upserted: number;
  created: number;
  updated: number;
  skippedNoPcId: number;
  skippedMatched: number;
  totalQueued: number;
};

export type StagingImportCandidate = {
  pcImportId: number;
  title: string;
  titlePc: string | null;
  platformSlug: string;
  consoleName: string | null;
  region: string;
  inRetroCatalog: boolean;
  quantity: number;
  pcRefPrice: number | null;
  recommendedPrice: number | null;
  marketMin: number | null;
  marketMax: number | null;
};
