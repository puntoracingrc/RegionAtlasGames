/**
 * Un anuncio solo cuenta para el precio si la región está verificada con pruebas
 * que cumplen las reglas de la plataforma y coinciden con el catálogo.
 */

import { checkListingEvidenceMeetsRules } from "./region-evidence-rules";

export type ListingRegionEvidence =
  | "cover_spain"
  | "cover_pal_eu"
  | "cover_usa"
  | "cover_japan"
  | "manual_es"
  | "manual_pal"
  | "sku_regional"
  | "barcode_regional"
  | "seller_states_region"
  | "listing_title_region"
  | "photo_region_mark";

export type MarketListingInput = {
  priceEur: number;
  source: "wallapop" | "ebay-es" | "vinted-es" | "other";
  listingType?: "sold" | "active";
  listingRegion?: string | null;
  regionVerified?: boolean;
  regionEvidence?: ListingRegionEvidence[] | string[];
  /** Confianza IA en la región detectada (0–1). */
  aiConfidence?: number | null;
};

const REGION_ALIASES: Record<string, Set<string>> = {
  "pal españa": new Set(["pal españa", "españa"]),
  españa: new Set(["pal españa", "españa"]),
  japón: new Set(["japón", "japan"]),
  japan: new Set(["japón", "japan"]),
};

function normalizeRegion(region: string): string {
  return region.trim().toLowerCase();
}

export function catalogRegionsMatch(catalogRegion: string, listingRegion: string): boolean {
  const c = normalizeRegion(catalogRegion);
  const l = normalizeRegion(listingRegion);
  if (c === l) return true;

  const catalogGroup = REGION_ALIASES[c];
  if (catalogGroup?.has(l)) return true;

  const listingGroup = REGION_ALIASES[l];
  if (listingGroup?.has(c)) return true;

  return false;
}

export function isListingRegionVerified(listing: MarketListingInput): boolean {
  if (listing.regionVerified !== true) return false;
  if (!listing.listingRegion?.trim()) return false;
  if (!listing.regionEvidence?.length) return false;
  return true;
}

export function isListingUsableForCatalogGame(
  platformSlug: string,
  catalogRegion: string,
  listing: MarketListingInput,
): boolean {
  if (!isListingRegionVerified(listing)) return false;
  if (!listing.listingRegion) return false;
  if (!catalogRegionsMatch(catalogRegion, listing.listingRegion)) return false;

  const evidence = (listing.regionEvidence ?? []).map(String);
  const check = checkListingEvidenceMeetsRules({
    platformSlug,
    catalogRegion,
    regionEvidence: evidence,
    aiConfidence: listing.aiConfidence,
  });
  return check.ok;
}

export function filterVerifiedListingsForGame(
  platformSlug: string,
  catalogRegion: string,
  listings: MarketListingInput[],
): {
  usable: MarketListingInput[];
  rejectedUnverified: MarketListingInput[];
  rejectedRegionMismatch: MarketListingInput[];
  rejectedInsufficientEvidence: MarketListingInput[];
} {
  const usable: MarketListingInput[] = [];
  const rejectedUnverified: MarketListingInput[] = [];
  const rejectedRegionMismatch: MarketListingInput[] = [];
  const rejectedInsufficientEvidence: MarketListingInput[] = [];

  for (const listing of listings) {
    if (!isListingRegionVerified(listing)) {
      rejectedUnverified.push(listing);
      continue;
    }
    if (!listing.listingRegion || !catalogRegionsMatch(catalogRegion, listing.listingRegion)) {
      rejectedRegionMismatch.push(listing);
      continue;
    }
    const evidence = (listing.regionEvidence ?? []).map(String);
    const check = checkListingEvidenceMeetsRules({
      platformSlug,
      catalogRegion,
      regionEvidence: evidence,
      aiConfidence: listing.aiConfidence,
    });
    if (!check.ok) {
      rejectedInsufficientEvidence.push(listing);
      continue;
    }
    usable.push(listing);
  }

  return {
    usable,
    rejectedUnverified,
    rejectedRegionMismatch,
    rejectedInsufficientEvidence,
  };
}

export const REGION_VERIFICATION_POLICY =
  "Solo entran anuncios con región verificada según las reglas de cada plataforma " +
  "(p. ej. PS4 PAL ES exige carátula española visible). Sin prueba suficiente = no cuenta.";

export function priceVerificationLabel(verified: boolean | undefined | null): string {
  if (verified === true) return "Región verificada";
  if (verified === false) return "Región no verificada";
  return "Región sin confirmar";
}
