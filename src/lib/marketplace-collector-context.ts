import {
  COLLECTOR_INTELLIGENCE_POLICY,
  COLLECTOR_LEARNING_SCHEMA_VERSION,
  type CollectorLearningSnapshot,
} from "./collector-learning";

const DEFAULT_LEARNING_URL =
  "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker/app/data/admin/collector-learning.json";
const CACHE_MS = 5 * 60 * 1000;

type CacheEntry = {
  loadedAt: number;
  snapshot: CollectorLearningSnapshot | null;
};

let cache: CacheEntry | null = null;

export type MarketplaceCollectorContext = {
  originalContentsExpected: string[];
  manualExpected: boolean | null;
  approvedRegionSignals: string[];
  referenceImageUrls: string[];
  rejectedReasonCodes: string[];
  rejectedReferenceImageUrls: string[];
};

async function loadSnapshot(): Promise<CollectorLearningSnapshot | null> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_MS) return cache.snapshot;

  const url = process.env.PRICE_COLLECTOR_LEARNING_URL?.trim() || DEFAULT_LEARNING_URL;
  try {
    const response = await fetch(`${url}?marketplace=${now}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json() as CollectorLearningSnapshot;
    if (
      snapshot.schemaVersion !== COLLECTOR_LEARNING_SCHEMA_VERSION
      || snapshot.policyVersion !== COLLECTOR_INTELLIGENCE_POLICY
      || !snapshot.games
    ) {
      throw new Error("Collector learning incompatible");
    }
    cache = { loadedAt: now, snapshot };
    return snapshot;
  } catch {
    cache = { loadedAt: now, snapshot: null };
    return null;
  }
}

export async function getMarketplaceCollectorContext(
  catalogId: string,
  region: string,
): Promise<MarketplaceCollectorContext> {
  const snapshot = await loadSnapshot();
  const game = snapshot?.games?.[catalogId];
  if (!game) {
    return {
      originalContentsExpected: [],
      manualExpected: null,
      approvedRegionSignals: [],
      referenceImageUrls: [],
      rejectedReasonCodes: [],
      rejectedReferenceImageUrls: [],
    };
  }

  const matchingExamples = game.approvedExamples.filter(
    (example) => !example.region || example.region === region,
  );
  const rejectedExamples = game.rejectedExamples ?? [];
  return {
    originalContentsExpected: game.originalContentsExpected ?? [],
    manualExpected: typeof game.manualExpected === "boolean" ? game.manualExpected : null,
    approvedRegionSignals: [...new Set(
      matchingExamples.flatMap((example) => example.regionEvidence),
    )].slice(0, 12),
    referenceImageUrls: [...new Set(
      matchingExamples.flatMap((example) => example.imageUrls),
    )].filter((url) => /^https:\/\//i.test(url)).slice(0, 2),
    rejectedReasonCodes: [...new Set(
      rejectedExamples.map((example) => example.reasonCode),
    )].slice(0, 6),
    rejectedReferenceImageUrls: [...new Set(
      rejectedExamples.flatMap((example) => example.imageUrls),
    )].filter((url) => /^https:\/\//i.test(url)).slice(0, 2),
  };
}
