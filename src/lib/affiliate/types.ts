export type AffiliateProvider = "rakuten" | "amazon" | "ebay" | "manual" | "mock";

export type AffiliateOfferCondition = "new" | "used" | "refurbished" | "unknown";

export type AffiliateOfferStatus = "active" | "inactive" | "expired" | "invalid" | "invalid_affiliate_url" | "pending_review";

export type AffiliateOffer = {
  id: string;
  gameId: string;
  provider: AffiliateProvider;
  advertiserId?: string;
  advertiserName?: string;
  merchantName: string;
  externalProductId?: string;
  externalProductUrl?: string;
  rawProductUrl?: string;
  affiliateUrl: string;
  title: string;
  platformDetected?: string;
  regionDetected?: string;
  condition: AffiliateOfferCondition;
  price?: number;
  currency?: string;
  shippingPrice?: number;
  availability?: string;
  imageUrl?: string;
  fetchedAt: string;
  expiresAt?: string;
  matchConfidence: number;
  status: AffiliateOfferStatus;
  raw?: unknown;
};

export type AffiliateOfferSearchInput = {
  gameId: string;
  title: string;
  edition?: string;
  platform?: string;
  region?: string;
  barcode?: string;
  publisher?: string;
  releaseYear?: number;
  maxResults?: number;
};
