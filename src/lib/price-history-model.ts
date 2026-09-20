import { CONDITION_PRICE_LABELS, type ConditionBucket } from "./condition-prices";
import type { PriceReceipt } from "./direct-price-connector";
import type { CatalogPriceTrend } from "./types";

// Missing = no observation for that state; null = explicitly unavailable.
export type PriceHistorySnapshot = { at: string } & Partial<Record<ConditionBucket, number | null>>;

export const PRICE_HISTORY_BUCKETS: ConditionBucket[] = ["loose", "gameManual", "complete", "sealed", "newRetail"];
export const PRICE_TREND_MIN_CHANGE_EUR = 5;
export const CONDITION_CHART_COLORS: Record<ConditionBucket, { stroke: string; label: string }> = {
  loose: { stroke: "#d97706", label: CONDITION_PRICE_LABELS.loose },
  gameManual: { stroke: "#0ea5e9", label: CONDITION_PRICE_LABELS.gameManual },
  complete: { stroke: "#10b981", label: CONDITION_PRICE_LABELS.complete },
  sealed: { stroke: "#8b5cf6", label: CONDITION_PRICE_LABELS.sealed },
  newRetail: { stroke: "#db2777", label: CONDITION_PRICE_LABELS.newRetail },
};

/** The receipt is committed atomically with the price: no second history write or re-blend. */
export function mergePublishedPriceHistory(
  catalogId: string,
  historical: readonly PriceHistorySnapshot[],
  receipts: readonly PriceReceipt[] = [],
): PriceHistorySnapshot[] {
  const byTime = new Map<number, PriceHistorySnapshot>();
  function add(at: string, prices: Partial<Record<ConditionBucket, number | null>>) {
    const time = Date.parse(at);
    if (!Number.isFinite(time)) return;
    const snapshot = { ...byTime.get(time), at: new Date(time).toISOString() };
    for (const bucket of PRICE_HISTORY_BUCKETS) {
      const value = prices[bucket];
      if (value === null || (typeof value === "number" && Number.isFinite(value) && value > 0)) {
        snapshot[bucket] = value;
      }
    }
    if (PRICE_HISTORY_BUCKETS.some(bucket => snapshot[bucket] !== undefined)) byTime.set(time, snapshot);
  }
  for (const snapshot of historical) add(snapshot.at, snapshot);
  const batches = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.catalogId !== catalogId || batches.has(receipt.batchId)) continue;
    batches.add(receipt.batchId);
    const prices: Partial<Record<ConditionBucket, number>> = {};
    for (const condition of receipt.conditions) prices[condition.state] = condition.after;
    add(receipt.publishedAt, prices);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, snapshot]) => snapshot);
}

/** Latest known values at a moment, without replacing one condition with another. */
export function priceHistoryAt(history: readonly PriceHistorySnapshot[], time: number): PriceHistorySnapshot {
  const snapshot: PriceHistorySnapshot = { at: new Date(time).toISOString() };
  for (const point of history) {
    if (Date.parse(point.at) > time) break;
    for (const bucket of PRICE_HISTORY_BUCKETS) {
      if (point[bucket] !== undefined) snapshot[bucket] = point[bucket];
    }
  }
  return snapshot;
}

function positiveValues(
  history: readonly PriceHistorySnapshot[],
  condition: "sealed" | "complete" | "loose",
): number[] {
  return history.flatMap((snapshot) => {
    const value = condition === "loose"
      ? snapshot.loose ?? snapshot.gameManual
      : snapshot[condition];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? [value] : [];
  });
}

/** Compara las dos últimas medias publicadas y absorbe oscilaciones menores de 5 €. */
export function catalogPriceTrends(
  history: readonly PriceHistorySnapshot[],
): Partial<Record<"sealed" | "complete" | "loose", CatalogPriceTrend>> {
  const trends: Partial<Record<"sealed" | "complete" | "loose", CatalogPriceTrend>> = {};
  for (const condition of ["sealed", "complete", "loose"] as const) {
    const values = positiveValues(history, condition);
    if (values.length < 2) continue;
    const change = values.at(-1)! - values.at(-2)!;
    trends[condition] = change >= PRICE_TREND_MIN_CHANGE_EUR
      ? "up"
      : change <= -PRICE_TREND_MIN_CHANGE_EUR
        ? "down"
        : "stable";
  }
  return trends;
}
