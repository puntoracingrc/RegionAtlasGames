import { validateAffiliateUrl } from "../../compliance/validate-affiliate-url";
import { scoreOfferMatch } from "../../matching/score-offer-match";
import type { AffiliateOffer, AffiliateOfferSearchInput } from "../../types";
import type { RakutenProduct } from "./rakuten-types";

function numberValue(value: string | number | undefined): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
}

function conditionValue(value: string | undefined): AffiliateOffer["condition"] {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("new") || normalized.includes("nuevo")) return "new";
  if (normalized.includes("used") || normalized.includes("usado")) return "used";
  if (normalized.includes("refurb")) return "refurbished";
  return "unknown";
}

export function normalizeRakutenOffer(input: AffiliateOfferSearchInput, product: RakutenProduct): AffiliateOffer | null {
  const title = product.title ?? product.productName;
  const affiliateUrl = product.clickUrl ?? product.linkUrl;
  const merchantName = product.merchantName ?? product.advertiserName;
  if (!title || !affiliateUrl || !merchantName) return null;

  const offer: AffiliateOffer = {
    id: `rakuten-${product.id ?? product.productId ?? Buffer.from(`${merchantName}:${title}`).toString("base64url")}`,
    gameId: input.gameId,
    provider: "rakuten",
    advertiserId: product.advertiserId,
    advertiserName: product.advertiserName,
    merchantName,
    externalProductId: product.productId ?? product.id,
    externalProductUrl: product.productUrl,
    affiliateUrl,
    title,
    condition: conditionValue(product.condition),
    price: numberValue(product.price),
    currency: product.currency ?? process.env.RAKUTEN_DEFAULT_CURRENCY ?? "EUR",
    availability: product.availability,
    imageUrl: product.imageUrl,
    fetchedAt: new Date().toISOString(),
    matchConfidence: 0,
    status: "active",
    raw: product,
  };
  offer.matchConfidence = scoreOfferMatch(input, offer);
  if (!validateAffiliateUrl(offer)) return null;
  return offer;
}
