import type { CollectionCondition } from "./types";

export type VitrinaSort = "recent" | "price-asc" | "price-desc";
export type VitrinaDelivery = "all" | "shipping" | "pickup";

export type VitrinaListing = {
  id: string;
  catalogId: string;
  title: string;
  catalogHref: string;
  contactHref: string;
  coverUrl: string | null;
  usesSellerPhoto: boolean;
  photoCount: number;
  askingPriceEur: number | null;
  condition: CollectionCondition;
  conditionLabel: string;
  platformSlug: string;
  platformName: string;
  region: string;
  regionLabel: string;
  regionShortLabel: string;
  sellerName: string;
  sellerCity: string | null;
  pickup: boolean;
  shipping: boolean;
  publishedAt: string | null;
};

export type VitrinaFilters = {
  query: string;
  platform: string;
  region: string;
  condition: CollectionCondition | "all";
  delivery: VitrinaDelivery;
  city: string;
  minPrice: number | null;
  maxPrice: number | null;
  sort: VitrinaSort;
};

export const DEFAULT_VITRINA_FILTERS: VitrinaFilters = {
  query: "",
  platform: "all",
  region: "all",
  condition: "all",
  delivery: "all",
  city: "",
  minPrice: null,
  maxPrice: null,
  sort: "recent",
};

export const VITRINA_CONDITION_LABELS: Record<CollectionCondition, string> = {
  sealed: "Precintado",
  complete: "Abierto y completo",
  "game-manual": "Juego + manual",
  loose: "Solo juego",
  unknown: "Estado sin indicar",
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesText(listing: VitrinaListing, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return normalize([
    listing.title,
    listing.platformName,
    listing.regionLabel,
    listing.sellerCity,
  ].filter(Boolean).join(" ")).includes(needle);
}

function sortTimestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function filterAndSortVitrinaListings(
  listings: readonly VitrinaListing[],
  filters: VitrinaFilters,
): VitrinaListing[] {
  const city = normalize(filters.city);
  const filtered = listings.filter((listing) => {
    if (!matchesText(listing, filters.query)) return false;
    if (filters.platform !== "all" && listing.platformSlug !== filters.platform) return false;
    if (filters.region !== "all" && listing.region !== filters.region) return false;
    if (filters.condition !== "all" && listing.condition !== filters.condition) return false;
    if (filters.delivery === "shipping" && !listing.shipping) return false;
    if (filters.delivery === "pickup" && !listing.pickup) return false;
    if (city && !normalize(listing.sellerCity ?? "").includes(city)) return false;
    if (filters.minPrice != null && (listing.askingPriceEur == null || listing.askingPriceEur < filters.minPrice)) {
      return false;
    }
    if (filters.maxPrice != null && (listing.askingPriceEur == null || listing.askingPriceEur > filters.maxPrice)) {
      return false;
    }
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "price-asc") {
      return (left.askingPriceEur ?? Number.POSITIVE_INFINITY)
        - (right.askingPriceEur ?? Number.POSITIVE_INFINITY);
    }
    if (filters.sort === "price-desc") {
      return (right.askingPriceEur ?? Number.NEGATIVE_INFINITY)
        - (left.askingPriceEur ?? Number.NEGATIVE_INFINITY);
    }
    return sortTimestamp(right.publishedAt) - sortTimestamp(left.publishedAt)
      || left.title.localeCompare(right.title, "es");
  });
}

export function hasActiveVitrinaFilters(filters: VitrinaFilters): boolean {
  return filters.query.trim() !== ""
    || filters.platform !== "all"
    || filters.region !== "all"
    || filters.condition !== "all"
    || filters.delivery !== "all"
    || filters.city.trim() !== ""
    || filters.minPrice != null
    || filters.maxPrice != null;
}

export function vitrinaFiltersToSearchParams(filters: VitrinaFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.platform !== "all") params.set("plataforma", filters.platform);
  if (filters.region !== "all") params.set("region", filters.region);
  if (filters.condition !== "all") params.set("estado", filters.condition);
  if (filters.delivery !== "all") params.set("entrega", filters.delivery);
  if (filters.city.trim()) params.set("ciudad", filters.city.trim());
  if (filters.minPrice != null) params.set("precio_min", String(filters.minPrice));
  if (filters.maxPrice != null) params.set("precio_max", String(filters.maxPrice));
  if (filters.sort !== "recent") params.set("orden", filters.sort);
  return params;
}
