export type RakutenAdvertiserSearchMerchant = {
  mid: string;
  merchantName: string;
};

export type RakutenPartnershipStatus = "unknown" | "not_applied" | "pending" | "approved" | "rejected" | "inactive";

export type RakutenAdvertiserCandidate = {
  provider: "rakuten";
  advertiserId: string;
  advertiserName: string;
  source: "advertisersearch-1.0";
  query: string;
  discoveredAt: string;
  partnershipStatus: RakutenPartnershipStatus;
  notes?: string;
};

export type RakutenAdvertiserSearchErrorCode =
  | "RAKUTEN_ADVERTISER_QUERY_EMPTY"
  | "RAKUTEN_ADVERTISER_AUTH_FAILED"
  | "RAKUTEN_ADVERTISER_RATE_LIMIT"
  | "RAKUTEN_ADVERTISER_REQUEST_FAILED";

export class RakutenAdvertiserSearchError extends Error {
  constructor(
    public readonly code: RakutenAdvertiserSearchErrorCode,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "RakutenAdvertiserSearchError";
  }
}
