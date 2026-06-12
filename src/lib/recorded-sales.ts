import { readFileSync, existsSync } from "fs";
import path from "path";
import type { RecordedPrivateSale } from "./marketplace-types";

const SALES_FILE = path.join(process.cwd(), "data", "marketplace", "recorded-sales.json");

function readSales(): RecordedPrivateSale[] {
  if (!existsSync(SALES_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SALES_FILE, "utf-8")) as RecordedPrivateSale[];
  } catch {
    return [];
  }
}

export function getRecordedSalesForCatalog(catalogId: string): RecordedPrivateSale[] {
  return readSales()
    .filter((s) => s.catalogId === catalogId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function recordedSalesSummary(catalogId: string): {
  count: number;
  medianEur: number | null;
  latestAt: string | null;
} {
  const sales = getRecordedSalesForCatalog(catalogId);
  if (sales.length === 0) {
    return { count: 0, medianEur: null, latestAt: null };
  }
  const prices = sales.map((s) => s.priceEur).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  return {
    count: sales.length,
    medianEur: Math.round(median * 100) / 100,
    latestAt: sales[0].completedAt,
  };
}
