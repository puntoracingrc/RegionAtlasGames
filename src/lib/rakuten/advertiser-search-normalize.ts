import type { RakutenAdvertiserCandidate, RakutenAdvertiserSearchMerchant } from "./advertiser-search.types";

export function normalizeRakutenAdvertiserCandidates(
  merchants: RakutenAdvertiserSearchMerchant[],
  query: string,
  discoveredAt = new Date().toISOString(),
): RakutenAdvertiserCandidate[] {
  const normalizedQuery = query.trim();
  return merchants.map((merchant) => ({
    provider: "rakuten",
    advertiserId: merchant.mid.trim(),
    advertiserName: merchant.merchantName.trim(),
    source: "advertisersearch-1.0",
    query: normalizedQuery,
    discoveredAt,
    partnershipStatus: "unknown",
  }));
}
