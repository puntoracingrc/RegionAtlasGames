import type { AffiliateOfferSearchInput } from "../affiliate/types.ts";

export type EbayCachedToken = {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
};

export type EbayTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

export type EbayMoney = {
  value?: string;
  currency?: string;
};

export type EbayItemSummary = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  image?: { imageUrl?: string };
  price?: EbayMoney;
  shippingOptions?: Array<{
    shippingCost?: EbayMoney;
  }>;
  condition?: string;
  itemEndDate?: string;
  estimatedAvailabilities?: Array<{
    estimatedAvailabilityStatus?: string;
    estimatedAvailableQuantity?: number;
  }>;
  itemLocation?: {
    country?: string;
  };
  buyingOptions?: string[];
};

export type EbaySearchResponse = {
  itemSummaries?: EbayItemSummary[];
  total?: number;
  limit?: number;
  offset?: number;
};

export interface EbaySearchInput extends Partial<AffiliateOfferSearchInput> {
  gameId?: string;
  query: string;
  title?: string;
  platform?: string;
  region?: string;
  gtin?: string;
  marketplaceId?: string;
  limit?: number;
  maxResults?: number;
}
