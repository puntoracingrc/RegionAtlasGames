import type { AffiliateOffer, AffiliateOfferSearchInput } from "../types.ts";
import { AFFILIATE_BLOCKED_KEYWORDS } from "./blocked-keywords.ts";
import { platformMatches } from "./normalize-platform.ts";
import { normalizeAffiliateText, titleTokens } from "./normalize-title.ts";
import { regionConflicts, regionMatches } from "./normalize-region.ts";

export function hasBlockedAffiliateKeyword(title: string): boolean {
  const normalized = normalizeAffiliateText(title);
  return AFFILIATE_BLOCKED_KEYWORDS.some((keyword) => normalized.includes(normalizeAffiliateText(keyword)));
}

export function scoreOfferMatch(input: AffiliateOfferSearchInput, offer: Pick<AffiliateOffer, "title">): number {
  const normalizedOfferTitle = normalizeAffiliateText(offer.title);
  if (!normalizedOfferTitle || hasBlockedAffiliateKeyword(offer.title)) return 0;

  const tokens = titleTokens(input.title);
  const matched = tokens.filter((token) => normalizedOfferTitle.includes(token)).length;
  let score = tokens.length > 0 ? (matched / tokens.length) * 0.62 : 0;

  if (input.barcode && normalizedOfferTitle.includes(normalizeAffiliateText(input.barcode))) score += 0.35;
  if (platformMatches(offer.title, input.platform)) score += 0.2;
  if (input.platform && !platformMatches(offer.title, input.platform)) score -= 0.18;
  if (regionMatches(offer.title, input.region)) score += 0.12;
  if (regionConflicts(offer.title, input.region)) score -= 0.45;
  if (/\bbundle\b|\blote\b|\bpack\b/.test(normalizedOfferTitle)) score -= 0.12;

  return Math.min(1, Math.max(0, Math.round(score * 100) / 100));
}
