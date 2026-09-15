import { getCatalogCardLookup } from "./catalog-card-lookup";
import { catalogGamePath } from "./catalog-path";
import { normalizeLegacyCollectionCondition } from "./collection-condition-policy";
import { getCoverSrc } from "./cover-url";
import { getActiveMarketplaceListings } from "./marketplace-listings-reader";
import { listingAskingPriceEur } from "./marketplace-listing-values";
import { getRegionDisplay } from "./region-display";
import {
  VITRINA_CONDITION_LABELS,
  VITRINA_PAGE_SIZE,
  filterAndSortVitrinaListings,
  type VitrinaFilters,
  type VitrinaListing,
} from "./vitrina-marketplace";

export type VitrinaFilterOptions = {
  platforms: Array<{ value: string; label: string }>;
  regions: Array<{ value: string; label: string; platformSlugs: string[] }>;
};

export type VitrinaBrowseResult = {
  items: VitrinaListing[];
  total: number;
  filterOptions: VitrinaFilterOptions;
};

function uniqueFilterOptions(listings: VitrinaListing[]): VitrinaFilterOptions {
  const platforms = new Map<string, string>();
  const regions = new Map<string, { label: string; platformSlugs: Set<string> }>();
  for (const listing of listings) {
    platforms.set(listing.platformSlug, listing.platformName);
    const region = regions.get(listing.region) ?? {
      label: listing.regionLabel,
      platformSlugs: new Set<string>(),
    };
    region.platformSlugs.add(listing.platformSlug);
    regions.set(listing.region, region);
  }
  return {
    platforms: [...platforms].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es")),
    regions: [...regions].map(([value, region]) => ({
      value,
      label: region.label,
      platformSlugs: [...region.platformSlugs],
    })).sort((a, b) => a.label.localeCompare(b.label, "es")),
  };
}

export async function getVitrinaBrowseResult(input: {
  filters: VitrinaFilters;
  page?: number;
  pageSize?: number;
  loggedIn: boolean;
}): Promise<VitrinaBrowseResult> {
  const catalog = getCatalogCardLookup();
  const stored = await getActiveMarketplaceListings();
  const all = stored.flatMap<VitrinaListing>((listing) => {
    const game = catalog.get(listing.catalogId);
    if (!game) return [];
    const condition = normalizeLegacyCollectionCondition(listing.collectionCondition, listing.sealed);
    const region = getRegionDisplay(game.region);
    const sellerCover = listing.photos.find((photo) => photo.slot === "cover-front")?.url ?? null;
    const salePath = `/venta/${encodeURIComponent(listing.id)}`;
    return [{
      id: listing.id,
      catalogId: game.id,
      title: listing.customTitle?.trim() || game.title,
      catalogHref: catalogGamePath({ ...game, canonicalSeoSlug: game.canonicalSeoSlug ?? undefined }),
      contactHref: input.loggedIn ? salePath : `/login?next=${encodeURIComponent(salePath)}`,
      coverUrl: sellerCover ?? getCoverSrc(game.coverUrl, game.id),
      usesSellerPhoto: Boolean(sellerCover),
      photoCount: listing.photos.length,
      askingPriceEur: listingAskingPriceEur(listing),
      condition,
      conditionLabel: VITRINA_CONDITION_LABELS[condition],
      platformSlug: game.platformSlug,
      platformName: game.platformName,
      region: game.region,
      regionLabel: region.label,
      regionShortLabel: region.shortLabel,
      sellerName: listing.sellerName,
      sellerCity: listing.sellerCity,
      pickup: listing.saleOptions?.pickup ?? true,
      shipping: listing.saleOptions?.shipping ?? true,
      publishedAt: listing.publishedAt,
    }];
  });
  const filtered = filterAndSortVitrinaListings(all, input.filters);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, input.pageSize ?? VITRINA_PAGE_SIZE);
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    filterOptions: uniqueFilterOptions(all),
  };
}
