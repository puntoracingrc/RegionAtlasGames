import { affiliateMinConfidenceRelated, affiliateMinConfidenceToShow } from "../affiliate/config.ts";
import { hasBlockedAffiliateKeyword, scoreOfferMatch } from "../affiliate/matching/score-offer-match.ts";
import type { AffiliateOffer, AffiliateOfferCondition, AffiliateOfferSearchInput, AffiliateOfferStatus } from "../affiliate/types.ts";
import type { EbayItemSummary, EbaySearchInput } from "./ebay.types.ts";

function parseMoney(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeEbayCondition(condition?: string): AffiliateOfferCondition {
  const normalized = condition?.toLowerCase() ?? "";
  if (normalized.includes("new") || normalized.includes("nuevo")) return "new";
  if (normalized.includes("refurbished") || normalized.includes("reacondicionado")) return "refurbished";
  if (normalized.includes("used") || normalized.includes("pre-owned") || normalized.includes("usado")) return "used";
  return "unknown";
}

function detectedPlatform(input: EbaySearchInput, title: string): string | undefined {
  return input.platform && title.toLowerCase().includes(input.platform.toLowerCase()) ? input.platform : undefined;
}

function detectedRegion(input: EbaySearchInput, title: string): string | undefined {
  return input.region && title.toLowerCase().includes(input.region.toLowerCase()) ? input.region : undefined;
}

function scoringInput(input: EbaySearchInput): AffiliateOfferSearchInput {
  return {
    gameId: input.gameId || "ebay-search",
    title: input.title || input.query,
    edition: input.edition,
    platform: input.platform,
    region: input.region,
    barcode: input.gtin || input.barcode,
    publisher: input.publisher,
    releaseYear: input.releaseYear,
    maxResults: input.maxResults ?? input.limit,
  };
}

function availabilityStatus(item: EbayItemSummary): string {
  const status = item.estimatedAvailabilities?.find((availability) => availability.estimatedAvailabilityStatus)?.estimatedAvailabilityStatus;
  return status || item.buyingOptions?.join(", ") || "available";
}

function isOutOfStock(item: EbayItemSummary): boolean {
  return item.estimatedAvailabilities?.some((availability) => availability.estimatedAvailabilityStatus === "OUT_OF_STOCK") ?? false;
}

function expiresAtFromItem(item: EbayItemSummary): { expiresAt: string; expired: boolean } {
  const itemEndDate = validDate(item.itemEndDate);
  if (itemEndDate) {
    return { expiresAt: itemEndDate.toISOString(), expired: itemEndDate.getTime() <= Date.now() };
  }
  return { expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), expired: false };
}

function statusFromItem(item: EbayItemSummary, affiliateUrl: string | undefined, score: number): AffiliateOfferStatus {
  const { expired } = expiresAtFromItem(item);
  if (expired) return "expired";
  if (isOutOfStock(item)) return "inactive";
  if (!affiliateUrl) return "invalid_affiliate_url";
  if (score >= affiliateMinConfidenceToShow()) return "active";
  if (score >= affiliateMinConfidenceRelated()) return "pending_review";
  return "invalid";
}

export function normalizeEbayItem(input: EbaySearchInput, item: EbayItemSummary, fetchedAt = new Date().toISOString()): AffiliateOffer | null {
  const itemId = item.itemId?.trim();
  const title = item.title?.trim();
  if (!itemId || !title) return null;
  if (hasBlockedAffiliateKeyword(title)) return null;

  const rawProductUrl = item.itemWebUrl?.trim();
  const affiliateUrl = item.itemAffiliateWebUrl?.trim() || "";
  const shippingCost = item.shippingOptions?.find((option) => option.shippingCost?.value)?.shippingCost;
  const matchInput = scoringInput(input);
  const score = scoreOfferMatch(matchInput, { title });
  if (score < affiliateMinConfidenceRelated()) return null;

  const { expiresAt } = expiresAtFromItem(item);

  return {
    id: `ebay-${itemId}`,
    gameId: input.gameId || "ebay-search",
    provider: "ebay",
    merchantName: "eBay",
    externalProductId: itemId,
    externalProductUrl: rawProductUrl,
    rawProductUrl,
    title,
    platformDetected: detectedPlatform(input, title),
    regionDetected: detectedRegion(input, title),
    condition: normalizeEbayCondition(item.condition),
    price: parseMoney(item.price?.value),
    currency: item.price?.currency,
    shippingPrice: parseMoney(shippingCost?.value),
    availability: availabilityStatus(item),
    imageUrl: item.image?.imageUrl,
    affiliateUrl,
    fetchedAt,
    expiresAt,
    matchConfidence: score,
    status: statusFromItem(item, affiliateUrl, score),
    raw: {
      rawProductUrl,
      itemEndDate: item.itemEndDate,
      estimatedAvailabilities: item.estimatedAvailabilities,
      itemLocation: item.itemLocation,
    },
  };
}
