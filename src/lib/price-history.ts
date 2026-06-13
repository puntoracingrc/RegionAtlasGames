import priceHistoryData from "../../data/price-history.json";
import type { ConditionBucket } from "./condition-prices";
import { CONDITION_PRICE_LABELS } from "./condition-prices";

export type PriceHistorySnapshot = {
  at: string;
  loose: number | null;
  complete: number | null;
  sealed: number | null;
};

export const CONDITION_CHART_COLORS: Record<
  ConditionBucket,
  { stroke: string; label: string }
> = {
  loose: { stroke: "#d97706", label: CONDITION_PRICE_LABELS.loose },
  complete: { stroke: "#10b981", label: CONDITION_PRICE_LABELS.complete },
  sealed: { stroke: "#8b5cf6", label: CONDITION_PRICE_LABELS.sealed },
};

type PriceHistoryFile = {
  version?: number;
  games?: Record<string, PriceHistorySnapshot[]>;
};

const historyFile = priceHistoryData as PriceHistoryFile;

export function getPriceHistory(catalogId: string): PriceHistorySnapshot[] {
  const series = historyFile.games?.[catalogId];
  if (!series?.length) return [];
  return [...series].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

export function hasPriceHistory(catalogId: string): boolean {
  return getPriceHistory(catalogId).length > 0;
}
