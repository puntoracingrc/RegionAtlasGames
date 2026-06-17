import type { AffiliateOffer } from "../types";

export function validateAffiliateUrl(offer: Pick<AffiliateOffer, "affiliateUrl" | "provider">): boolean {
  try {
    const parsed = new URL(offer.affiliateUrl);
    if (!["https:"].includes(parsed.protocol)) return false;
    if (offer.provider === "rakuten") return /linksynergy|rakuten|click|go|shop|http/i.test(parsed.hostname);
    return true;
  } catch {
    return false;
  }
}
