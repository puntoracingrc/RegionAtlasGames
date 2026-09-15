import { canonicalCatalogLink } from "./catalog-id-aliases";
import { readMarketplaceDocument } from "./marketplace-document-store";
import type { MarketplaceListing } from "./marketplace-types";

const LISTINGS_DOCUMENT = "listings.json";

export async function readMarketplaceListings(): Promise<MarketplaceListing[]> {
  return (await readMarketplaceDocument<MarketplaceListing>(LISTINGS_DOCUMENT))
    .map(canonicalCatalogLink);
}

export async function getActiveMarketplaceListings(): Promise<MarketplaceListing[]> {
  return (await readMarketplaceListings())
    .filter((listing) => listing.status === "active")
    .sort((left, right) =>
      (right.publishedAt ?? right.updatedAt).localeCompare(left.publishedAt ?? left.updatedAt),
    );
}
