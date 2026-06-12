/**
 * Estimación de precio ES a partir de anuncios (Wallapop, eBay.es, etc.).
 * Solo anuncios con región verificada y coincidente con el catálogo.
 * Descarta outliers: 1 € de impuestos, caídas imposibles, valores fuera de rango.
 */

import {
  filterVerifiedListingsForGame,
  type MarketListingInput,
} from "./listing-region-verification";

export type PriceListing = MarketListingInput;

export type PriceEstimateInput = {
  platformSlug: string;
  catalogRegion: string;
  listings: PriceListing[];
  previousPrice: number | null;
  pcRefPrice: number | null;
  floorEur?: number;
};

export type PriceEstimateResult =
  | {
      ok: true;
      recommendedPrice: number;
      sampleSize: number;
      verifiedSampleSize: number;
      rejectedCount: number;
      rejectedUnverifiedRegion: number;
      rejectedRegionMismatch: number;
      rejectedInsufficientEvidence: number;
      method: "median";
    }
  | {
      ok: false;
      reason:
        | "no_listings"
        | "no_verified_region_listings"
        | "all_rejected"
        | "drop_too_steep";
      rejectedCount: number;
      rejectedUnverifiedRegion: number;
      rejectedRegionMismatch: number;
      rejectedInsufficientEvidence: number;
      sampleSize: number;
      verifiedSampleSize: number;
    };

const DEFAULT_FLOOR = 3;
const MAX_DROP_RATIO = 0.5;
const MIN_VS_PC_REF = 0.25;
const IQR_MULTIPLIER = 1.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function quartiles(values: number[]): { q1: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, mid);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  return { q1: median(lower), q3: median(upper) };
}

function absoluteFloor(input: PriceEstimateInput): number {
  const floor = input.floorEur ?? DEFAULT_FLOOR;
  const refs: number[] = [floor];
  if (input.previousPrice != null && input.previousPrice > 0) {
    refs.push(input.previousPrice * MAX_DROP_RATIO);
  }
  if (input.pcRefPrice != null && input.pcRefPrice > 20) {
    refs.push(input.pcRefPrice * MIN_VS_PC_REF);
  }
  return Math.max(...refs);
}

export function filterListingPrices(input: PriceEstimateInput): {
  accepted: number[];
  rejected: number[];
} {
  const raw = input.listings
    .map((l) => l.priceEur)
    .filter((p) => Number.isFinite(p) && p > 0);

  if (raw.length === 0) return { accepted: [], rejected: [] };

  const minAllowed = absoluteFloor(input);
  const afterFloor = raw.filter((p) => p >= minAllowed);
  const rejectedFloor = raw.filter((p) => p < minAllowed);

  if (afterFloor.length === 0) {
    return { accepted: [], rejected: raw };
  }

  if (afterFloor.length < 4) {
    return { accepted: afterFloor, rejected: rejectedFloor };
  }

  const { q1, q3 } = quartiles(afterFloor);
  const iqr = q3 - q1;
  const low = q1 - IQR_MULTIPLIER * iqr;
  const high = q3 + IQR_MULTIPLIER * iqr;

  const accepted = afterFloor.filter((p) => p >= low && p <= high);
  const rejectedIqr = afterFloor.filter((p) => p < low || p > high);

  return {
    accepted,
    rejected: [...rejectedFloor, ...rejectedIqr],
  };
}

export function estimatePriceFromListings(input: PriceEstimateInput): PriceEstimateResult {
  const sampleSize = input.listings.length;
  const { usable, rejectedUnverified, rejectedRegionMismatch, rejectedInsufficientEvidence } =
    filterVerifiedListingsForGame(input.platformSlug, input.catalogRegion, input.listings);
  const verifiedSampleSize = usable.length;

  const baseReject = {
    rejectedUnverifiedRegion: rejectedUnverified.length,
    rejectedRegionMismatch: rejectedRegionMismatch.length,
    rejectedInsufficientEvidence: rejectedInsufficientEvidence.length,
    sampleSize,
    verifiedSampleSize,
  };

  if (sampleSize === 0) {
    return { ok: false, reason: "no_listings", rejectedCount: 0, ...baseReject };
  }

  if (verifiedSampleSize === 0) {
    return {
      ok: false,
      reason: "no_verified_region_listings",
      rejectedCount: rejectedUnverified.length + rejectedRegionMismatch.length + rejectedInsufficientEvidence.length,
      ...baseReject,
    };
  }

  const priceInput: PriceEstimateInput = { ...input, listings: usable };
  const { accepted, rejected } = filterListingPrices(priceInput);

  if (accepted.length === 0) {
    return {
      ok: false,
      reason: "all_rejected",
      rejectedCount:
        rejected.length +
        rejectedUnverified.length +
        rejectedRegionMismatch.length +
        rejectedInsufficientEvidence.length,
      ...baseReject,
    };
  }

  const recommendedPrice = Math.round(median(accepted) * 100) / 100;

  if (
    input.previousPrice != null &&
    input.previousPrice > 10 &&
    recommendedPrice < input.previousPrice * MAX_DROP_RATIO
  ) {
    return {
      ok: false,
      reason: "drop_too_steep",
      rejectedCount:
        rejected.length +
        rejectedUnverified.length +
        rejectedRegionMismatch.length +
        rejectedInsufficientEvidence.length,
      ...baseReject,
    };
  }

  return {
    ok: true,
    recommendedPrice,
    sampleSize,
    verifiedSampleSize,
    rejectedCount:
      rejected.length +
      rejectedUnverified.length +
      rejectedRegionMismatch.length +
      rejectedInsufficientEvidence.length,
    rejectedUnverifiedRegion: rejectedUnverified.length,
    rejectedRegionMismatch: rejectedRegionMismatch.length,
    rejectedInsufficientEvidence: rejectedInsufficientEvidence.length,
    method: "median",
  };
}

export function deltaEsVsPc(recommended: number | null, pcRef: number | null): number | null {
  if (recommended == null || pcRef == null || pcRef === 0) return null;
  return Math.round(((recommended - pcRef) / pcRef) * 1000) / 10;
}
