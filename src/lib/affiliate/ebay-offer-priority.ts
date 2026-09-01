export type EbayAffiliateSearchScope = "spain" | "expanded";
export type EbayOfferMarketScope = "spain" | "international";

type EbayOfferCandidate = {
  id: string;
  location: string | null;
};

export function ebayAffiliateSearchFilter(scope: EbayAffiliateSearchScope): string {
  const filters = ["buyingOptions:{FIXED_PRICE}", "deliveryCountry:ES"];
  if (scope === "spain") filters.push("itemLocationCountry:ES");
  return filters.join(",");
}

export function isSpanishEbayLocation(value: string | null | undefined): boolean {
  const normalized = value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  return normalized === "ES" || normalized === "ESP" || normalized === "SPAIN" || normalized === "ESPANA";
}

export function mergeSpainFirstEbayOffers<T extends EbayOfferCandidate>(
  spainOffers: T[],
  expandedOffers: T[],
  limit: number,
): Array<T & { marketScope: EbayOfferMarketScope }> {
  const seen = new Set<string>();
  const domestic: Array<T & { marketScope: "spain" }> = [];
  const international: Array<T & { marketScope: "international" }> = [];

  const add = (offer: T, marketScope: EbayOfferMarketScope) => {
    if (seen.has(offer.id)) return;
    seen.add(offer.id);
    if (marketScope === "spain") domestic.push({ ...offer, marketScope });
    else international.push({ ...offer, marketScope });
  };

  for (const offer of spainOffers) add(offer, "spain");
  for (const offer of expandedOffers) {
    add(offer, isSpanishEbayLocation(offer.location) ? "spain" : "international");
  }

  return [...domestic, ...international].slice(0, Math.max(0, limit));
}

export function shouldExpandEbaySearch(spainOfferCount: number, minimumSpainOffers: number): boolean {
  return spainOfferCount < minimumSpainOffers;
}
