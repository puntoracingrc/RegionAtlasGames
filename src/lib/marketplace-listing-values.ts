import type {
  ApproximateListingLocation,
  MarketplaceListing,
} from "./marketplace-types";

type ListingPriceFields = Pick<
  MarketplaceListing,
  "askingPriceEur" | "recordedSalePriceEur" | "status"
>;

function positiveMoney(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || value == null || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function listingAskingPriceEur(listing: ListingPriceFields): number | null {
  const askingPrice = positiveMoney(listing.askingPriceEur);
  if (askingPrice != null) return askingPrice;

  // Before askingPriceEur existed, open listings stored their suggested price here.
  if (listing.status === "draft" || listing.status === "active") {
    return positiveMoney(listing.recordedSalePriceEur);
  }
  return null;
}

export function normalizeAskingPriceEur(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return positiveMoney(parsed);
}

export function coarsenListingLocation(value: unknown): ApproximateListingLocation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { latitude?: unknown; longitude?: unknown };
  if (typeof candidate.latitude !== "number" || typeof candidate.longitude !== "number") {
    return null;
  }
  const latitude = candidate.latitude;
  const longitude = candidate.longitude;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  return {
    latitude: Math.round(latitude * 10) / 10,
    longitude: Math.round(longitude * 10) / 10,
    precision: "approximate",
  };
}
