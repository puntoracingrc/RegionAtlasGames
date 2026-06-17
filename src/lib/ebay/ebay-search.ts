import { affiliateMinConfidenceRelated } from "../affiliate/config.ts";
import type { AffiliateOffer } from "../affiliate/types.ts";
import { ebayBrowseApiBase, ebayFetch } from "./ebay-client.ts";
import { normalizeEbayItem } from "./ebay-normalize.ts";
import type { EbaySearchInput, EbaySearchResponse } from "./ebay.types.ts";

export function buildEbaySearchQuery(input: EbaySearchInput): string {
  const query = input.query?.trim() || [input.title, input.platform, input.region].filter(Boolean).join(" ");
  return query.trim();
}

export async function searchEbayOffers(input: EbaySearchInput): Promise<AffiliateOffer[]> {
  if (process.env.EBAY_AFFILIATE_ENABLED !== "true") return [];

  const query = buildEbaySearchQuery(input);
  if (!query && !input.gtin) return [];

  const maxResults = Math.min(50, Math.max(1, input.limit ?? input.maxResults ?? 10));
  const url = new URL(`${ebayBrowseApiBase()}/item_summary/search`);
  if (query) url.searchParams.set("q", query);
  if (input.gtin) url.searchParams.set("gtin", input.gtin);
  url.searchParams.set("limit", String(maxResults));

  const response = await ebayFetch<EbaySearchResponse>(url.toString(), {}, { marketplaceId: input.marketplaceId, gameId: input.gameId });
  return (response.itemSummaries ?? [])
    .map((item) => normalizeEbayItem(input, item))
    .filter((offer): offer is AffiliateOffer => Boolean(offer))
    .filter((offer) => offer.matchConfidence >= affiliateMinConfidenceRelated())
    .sort((a, b) => b.matchConfidence - a.matchConfidence);
}
