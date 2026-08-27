import type { RecordedPrivateSale } from "./marketplace-types";
import { readMarketplaceDocument } from "./marketplace-document-store";

const SALES_DOCUMENT = "recorded-sales.json";

export async function getRecordedSalesForCatalog(
  catalogId: string,
): Promise<RecordedPrivateSale[]> {
  return (await readMarketplaceDocument<RecordedPrivateSale>(SALES_DOCUMENT))
    .filter((sale) => sale.catalogId === catalogId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export async function recordedSalesSummary(catalogId: string): Promise<{
  count: number;
  medianEur: number | null;
  latestAt: string | null;
}> {
  const sales = await getRecordedSalesForCatalog(catalogId);
  if (sales.length === 0) {
    return { count: 0, medianEur: null, latestAt: null };
  }
  const prices = sales.map((sale) => sale.priceEur).sort((a, b) => a - b);
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
