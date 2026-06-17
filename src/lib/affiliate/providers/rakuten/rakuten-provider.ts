import { affiliateMinConfidenceRelated } from "../../config";
import type { AffiliateOffer, AffiliateOfferSearchInput } from "../../types";
import type { AffiliateOfferProvider } from "../provider.interface";
import { normalizeRakutenOffer } from "./rakuten-normalize";
import type { RakutenProduct } from "./rakuten-types";

type RakutenProductSearchResponse = {
  products?: RakutenProduct[];
  results?: RakutenProduct[];
};

function isEnabled(): boolean {
  return process.env.RAKUTEN_AFFILIATE_ENABLED === "true";
}

function productSearchEndpoint(): string | null {
  const endpoint = process.env.RAKUTEN_PRODUCT_SEARCH_ENDPOINT?.trim();
  return endpoint || null;
}

export class RakutenAffiliateProvider implements AffiliateOfferProvider {
  id = "rakuten" as const;

  isEnabled(): boolean {
    return isEnabled();
  }

  async searchOffers(input: AffiliateOfferSearchInput): Promise<AffiliateOffer[]> {
    if (!this.isEnabled()) return [];
    const endpoint = productSearchEndpoint();
    if (!endpoint) return [];

    const { rakutenFetch } = await import("./rakuten-client");
    const url = new URL(endpoint);
    url.searchParams.set("keyword", input.barcode || `${input.title} ${input.platform ?? ""}`.trim());
    url.searchParams.set("max", String(input.maxResults ?? 10));

    const response = await rakutenFetch<RakutenProductSearchResponse>(url.toString());
    const rawProducts = response.products ?? response.results ?? [];
    return rawProducts
      .map((product) => normalizeRakutenOffer(input, product))
      .filter((offer): offer is AffiliateOffer => Boolean(offer))
      .filter((offer) => offer.matchConfidence >= affiliateMinConfidenceRelated())
      .sort((a, b) => b.matchConfidence - a.matchConfidence);
  }

  async validateOffer(offer: AffiliateOffer): Promise<boolean> {
    return Boolean(offer.affiliateUrl && offer.merchantName && offer.title && offer.status !== "invalid");
  }
}
