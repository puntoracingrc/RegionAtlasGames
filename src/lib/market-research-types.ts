import type { CoverResearchCandidate } from "./cover-research";
import type {
  EbayConditionEstimate,
} from "./ebay/ebay-research";
import type { EbayResearchDecision, EbaySearchBasis } from "./ebay/ebay-research-match";

export type MarketObservationReviewStatus = "accepted" | "pending" | "rejected";

export type MarketObservation = {
  id: string;
  source: "ebay";
  marketplaceId: string;
  listingId: string;
  catalogId: string;
  originCatalogId: string;
  sourceDecision: EbayResearchDecision;
  reviewStatus: MarketObservationReviewStatus;
  title: string;
  url: string | null;
  affiliateUrl: string | null;
  imageUrls: string[];
  price: number | null;
  shippingPrice: number | null;
  totalPrice: number | null;
  currency: string | null;
  condition: string | null;
  conditionBucket: "loose" | "game_manual" | "complete" | "sealed" | "unknown";
  confidence: number;
  detectedRegion: string | null;
  targetRegion: string;
  sellerCountry: string | null;
  itemEndDate: string | null;
  exactIdentifier: boolean;
  exactReference: boolean;
  epid: string | null;
  gtin: string | null;
  reasons: string[];
  searchBasis: EbaySearchBasis[];
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type StoredCoverCandidate = CoverResearchCandidate & {
  catalogId: string;
  status: "pending" | "approved" | "rejected";
  firstSeenAt: string;
  lastSeenAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  publishedCoverUrl: string | null;
};

export type MarketResearchRun = {
  id: string;
  catalogId: string;
  collectedAt: string;
  collectedBy: string;
  accepted: number;
  pending: number;
  routed: number;
  rejected: number;
  coverCandidates: number;
  warnings: string[];
};

export type MarketResearchPublication = {
  id: string;
  publishedAt: string;
  publishedBy: string;
  conditions: Array<Exclude<MarketObservation["conditionBucket"], "unknown">>;
  prices: Partial<Record<Exclude<MarketObservation["conditionBucket"], "unknown">, number>>;
};

export type MarketResearchEstimate = EbayConditionEstimate & {
  activeObservations: number;
  outliers: number;
  publishable: boolean;
};

export type MarketResearchCatalogView = {
  schemaVersion: 1;
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
  updatedAt: string;
  lastCollectedAt: string | null;
  observations: MarketObservation[];
  coverCandidates: StoredCoverCandidate[];
  runs: MarketResearchRun[];
  publications: MarketResearchPublication[];
  estimates: MarketResearchEstimate[];
  counts: {
    accepted: number;
    pending: number;
    rejected: number;
    current: number;
    expired: number;
  };
};

export type MarketCollectionMode = "missing_price" | "missing_cover" | "missing_any" | "refresh";
export type MarketBatchStatus = "ready" | "running" | "paused" | "completed" | "cancelled";
export type MarketBatchTargetStatus = "pending" | "running" | "completed" | "failed";

export type MarketResearchBatchTarget = {
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
  status: MarketBatchTargetStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  observations: number;
  routed: number;
  covers: number;
};

export type MarketResearchBatch = {
  id: string;
  status: MarketBatchStatus;
  mode: MarketCollectionMode;
  platformSlug: string;
  region: string | null;
  limit: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  targets: MarketResearchBatchTarget[];
  log: Array<{
    at: string;
    level: "info" | "error";
    message: string;
    catalogId?: string;
  }>;
};

export type MarketCollectionResult = {
  stored: MarketResearchCatalogView;
  affectedCatalogIds: string[];
  observations: number;
  routed: number;
  pendingRouting: number;
  rejected: number;
  coverCandidates: number;
};
