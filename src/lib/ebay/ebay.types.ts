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

export type EbayImage = {
  imageUrl?: string;
  width?: number;
  height?: number;
};

export type EbayLocalizedAspect = {
  localizedName?: string;
  localizedValues?: string[];
};

export type EbayItemSummary = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  image?: EbayImage;
  additionalImages?: EbayImage[];
  thumbnailImages?: EbayImage[];
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
  epid?: string;
  inferredEpid?: string;
  gtin?: string;
  conditionId?: string;
  localizedAspects?: EbayLocalizedAspect[];
};

export type EbayItem = EbayItemSummary & {
  shortDescription?: string;
};

export type EbaySearchResponse = {
  itemSummaries?: EbayItemSummary[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type EbayCatalogProductSummary = {
  epid?: string;
  title?: string;
  productWebUrl?: string;
  image?: EbayImage;
  additionalImages?: EbayImage[];
  gtin?: string[];
  mpn?: string[];
  brand?: string;
  aspects?: EbayLocalizedAspect[];
};

export type EbayCatalogSearchResponse = {
  productSummaries?: EbayCatalogProductSummary[];
  total?: number;
  limit?: number;
  offset?: number;
};

export interface EbaySearchInput extends Partial<AffiliateOfferSearchInput> {
  gameId?: string;
  query: string;
  title?: string;
  platform?: string;
  platformSlug?: string;
  region?: string;
  gtin?: string;
  marketplaceId?: string;
  limit?: number;
  maxResults?: number;
}
