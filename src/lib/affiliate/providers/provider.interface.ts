import type { AffiliateOffer, AffiliateOfferSearchInput, AffiliateProvider } from "../types";

export interface AffiliateOfferProvider {
  id: AffiliateProvider;
  isEnabled(): boolean;
  searchOffers(input: AffiliateOfferSearchInput): Promise<AffiliateOffer[]>;
  validateOffer(offer: AffiliateOffer): Promise<boolean>;
}
