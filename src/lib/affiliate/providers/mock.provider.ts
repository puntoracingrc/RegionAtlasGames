import { affiliateMinConfidenceRelated } from "../config";
import { scoreOfferMatch } from "../matching/score-offer-match";
import type { AffiliateOffer, AffiliateOfferSearchInput } from "../types";
import type { AffiliateOfferProvider } from "./provider.interface";

export class MockAffiliateProvider implements AffiliateOfferProvider {
  id = "mock" as const;

  isEnabled(): boolean {
    return process.env.AFFILIATE_MOCK_PROVIDER_ENABLED === "true";
  }

  async searchOffers(input: AffiliateOfferSearchInput): Promise<AffiliateOffer[]> {
    if (!this.isEnabled()) return [];
    const offer: AffiliateOffer = {
      id: `mock-${input.gameId}`,
      gameId: input.gameId,
      provider: "mock",
      merchantName: "Mock Store",
      affiliateUrl: "https://example.com/mock-affiliate-offer",
      title: `${input.title} ${input.platform ?? ""} ${input.region ?? ""}`.trim(),
      condition: "unknown",
      price: 49.99,
      currency: "EUR",
      fetchedAt: new Date().toISOString(),
      matchConfidence: 0,
      status: "active",
    };
    offer.matchConfidence = scoreOfferMatch(input, offer);
    return offer.matchConfidence >= affiliateMinConfidenceRelated() ? [offer] : [];
  }

  async validateOffer(offer: AffiliateOffer): Promise<boolean> {
    return Boolean(offer.affiliateUrl && offer.merchantName && offer.title && offer.fetchedAt);
  }
}
