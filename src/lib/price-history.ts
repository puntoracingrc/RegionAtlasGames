import priceHistoryData from "../../data/price-history.json";
import type { PriceConnectorGame } from "./direct-price-connector";
import { mergePublishedPriceHistory, type PriceHistorySnapshot } from "./price-history-model";
export type { PriceHistorySnapshot } from "./price-history-model";

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

export function getPublishedPriceHistory(game: PriceConnectorGame): PriceHistorySnapshot[] {
  return mergePublishedPriceHistory(game.id, getPriceHistory(game.id), game.priceConnectorReceipts);
}
