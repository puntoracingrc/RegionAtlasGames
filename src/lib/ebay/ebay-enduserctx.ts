export type EbayEndUserContextInput = {
  campaignId?: string;
  customIdPrefix?: string;
  gameId?: string;
  gameSlug?: string;
  platformSlug?: string;
  country?: string;
  zip?: string;
};

function cleanContextValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 64);
}

export function buildEbayAffiliateReferenceId(input: Pick<EbayEndUserContextInput, "customIdPrefix" | "gameId"> = {}): string {
  const prefix = cleanContextValue(input.customIdPrefix?.trim() || process.env.EBAY_CUSTOM_ID_PREFIX?.trim() || "rag");
  const gameId = input.gameId ? cleanContextValue(input.gameId) : "search";
  return [prefix, "game", gameId].filter(Boolean).join("-").slice(0, 64);
}

export function buildEbayGameCustomId(input: Pick<EbayEndUserContextInput, "customIdPrefix" | "gameId" | "gameSlug" | "platformSlug"> = {}): string {
  const prefix = cleanContextValue(input.customIdPrefix?.trim() || process.env.EBAY_CUSTOM_ID_PREFIX?.trim() || "rag");
  const gameSlug = cleanContextValue(input.gameSlug?.trim() || input.gameId?.trim() || "search");
  const platformSlug = input.platformSlug ? cleanContextValue(input.platformSlug) : "";
  return [prefix, "game", gameSlug, platformSlug].filter(Boolean).join("-").slice(0, 64);
}

export function buildEbayEndUserContext(input: EbayEndUserContextInput = {}): string | null {
  const campaignId = input.campaignId?.trim() || process.env.EBAY_CAMPAIGN_ID?.trim();
  const parts: string[] = [];

  if (campaignId) {
    parts.push(`affiliateCampaignId=${encodeURIComponent(campaignId)}`);
    parts.push(`affiliateReferenceId=${encodeURIComponent(buildEbayGameCustomId(input))}`);
  }

  const country = input.country?.trim() || process.env.EBAY_CONTEXTUAL_COUNTRY?.trim();
  if (country) parts.push(`contextualLocation=country%3D${encodeURIComponent(country)}`);

  const zip = input.zip?.trim() || process.env.EBAY_CONTEXTUAL_ZIP?.trim();
  if (zip) parts.push(`zip=${encodeURIComponent(zip)}`);

  return parts.length > 0 ? parts.join(",") : null;
}
