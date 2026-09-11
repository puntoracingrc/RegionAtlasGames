import { countries } from "country-flag-icons";
import { getRegionDisplay } from "../region-display";
import type { CatalogGame } from "../types";

export type EbayAffiliateSearchScope = "preferred" | "expanded";
export type EbayOfferMarketScope = "preferred" | "other" | "unrestricted";

type EbayOfferCandidate = {
  id: string;
  location: string | null;
};

const NON_COUNTRY_FLAGS = new Set(["AC", "CP", "DG", "EA", "EU", "IC", "TA", "UN", "XK"]);
const countryCodes = new Set(countries.filter(code => /^[A-Z]{2}$/.test(code) && !NON_COUNTRY_FLAGS.has(code)));
const countryAliases = new Map<string, string>();

function normalizedCountryText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

for (const language of ["es", "en"]) {
  const names = new Intl.DisplayNames([language], { type: "region" });
  for (const code of countryCodes) {
    countryAliases.set(code, code);
    const name = names.of(code);
    if (name) countryAliases.set(normalizedCountryText(name), code);
  }
}
for (const [alias, code] of Object.entries({ UK: "GB", GBR: "GB", ESP: "ES", USA: "US", KOREA: "KR" })) {
  countryAliases.set(alias, code);
}

export function normalizeEbayCountry(value: string | null | undefined): string | null {
  return value ? countryAliases.get(normalizedCountryText(value)) ?? null : null;
}

/** A regional family, language or multi-country market is not a single country. */
export function ebayPriorityCountry(
  game: Pick<CatalogGame, "region" | "regionCode" | "marketRegion">,
): string | null {
  if (game.regionCode?.trim()) return normalizeEbayCountry(game.regionCode);
  if (game.marketRegion?.trim()) return normalizeEbayCountry(game.marketRegion);
  return normalizeEbayCountry(getRegionDisplay(game.region).flagCode) ?? normalizeEbayCountry(game.region);
}

export function ebayAffiliateSearchFilter(scope: EbayAffiliateSearchScope, country: string | null): string {
  const filters = ["buyingOptions:{FIXED_PRICE}", "deliveryCountry:ES"];
  const origin = normalizeEbayCountry(country);
  if (scope === "preferred" && origin) filters.push(`itemLocationCountry:${origin}`);
  return filters.join(",");
}

export function ebayOfferCountryPriority(
  offer: { provider: string; location: string | null },
  country: string | null,
): number {
  const preferred = normalizeEbayCountry(country);
  if (offer.provider !== "ebay" || !preferred) return 0;
  return normalizeEbayCountry(offer.location) === preferred ? 0 : 1;
}

export function mergeRegionFirstEbayOffers<T extends EbayOfferCandidate>(
  preferredOffers: T[],
  expandedOffers: T[],
  limit: number,
  country: string | null,
): Array<T & { marketScope: EbayOfferMarketScope }> {
  const seen = new Set<string>();
  const preferred = normalizeEbayCountry(country);
  const offers: Array<T & { marketScope: EbayOfferMarketScope }> = [];
  for (const offer of [...preferredOffers, ...expandedOffers]) {
    if (seen.has(offer.id)) continue;
    seen.add(offer.id);
    offers.push({
      ...offer,
      marketScope: !preferred ? "unrestricted" : normalizeEbayCountry(offer.location) === preferred ? "preferred" : "other",
    });
  }
  return offers.sort((a, b) => Number(a.marketScope === "other") - Number(b.marketScope === "other"))
    .slice(0, Math.max(0, limit));
}

export function shouldExpandEbaySearch(preferredOfferCount: number, minimumPreferredOffers: number): boolean {
  return preferredOfferCount < minimumPreferredOffers;
}
