import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { VitrinaMarketplace } from "@/components/vitrina-marketplace";
import { getCatalogGame, getPlatform, isPublicCatalogGame } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-url";
import { normalizeLegacyCollectionCondition } from "@/lib/collection-condition-policy";
import { getCoverSrc } from "@/lib/cover-url";
import { getActiveMarketplaceListings } from "@/lib/listings";
import { listingAskingPriceEur } from "@/lib/marketplace-listing-values";
import { getRegionDisplay } from "@/lib/region-display";
import { getCurrentUser } from "@/lib/users";
import {
  DEFAULT_VITRINA_FILTERS,
  VITRINA_CONDITION_LABELS,
  type VitrinaDelivery,
  type VitrinaFilters,
  type VitrinaListing,
  type VitrinaSort,
} from "@/lib/vitrina-marketplace";
import type { CollectionCondition } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vitrina de juegos en venta | Region Atlas",
  description: "Juegos físicos publicados por coleccionistas de Region Atlas, con búsqueda por plataforma, estado, región y entrega.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CONDITIONS = new Set<CollectionCondition>(["sealed", "complete", "game-manual", "loose", "unknown"]);
const DELIVERIES = new Set<VitrinaDelivery>(["all", "shipping", "pickup"]);
const SORTS = new Set<VitrinaSort>(["recent", "price-asc", "price-desc"]);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function price(value: string | string[] | undefined): number | null {
  const parsed = Number.parseFloat(first(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function initialFilters(params: Record<string, string | string[] | undefined>): VitrinaFilters {
  const condition = first(params.estado);
  const delivery = first(params.entrega);
  const sort = first(params.orden);
  return {
    ...DEFAULT_VITRINA_FILTERS,
    query: first(params.q).slice(0, 120),
    platform: first(params.plataforma) || "all",
    region: first(params.region) || "all",
    condition: CONDITIONS.has(condition as CollectionCondition)
      ? condition as CollectionCondition
      : "all",
    delivery: DELIVERIES.has(delivery as VitrinaDelivery)
      ? delivery as VitrinaDelivery
      : "all",
    city: first(params.ciudad).slice(0, 80),
    minPrice: price(params.precio_min),
    maxPrice: price(params.precio_max),
    sort: SORTS.has(sort as VitrinaSort) ? sort as VitrinaSort : "recent",
  };
}

export default async function VitrinaPage({ searchParams }: Props) {
  const [storedListings, user, params] = await Promise.all([
    getActiveMarketplaceListings(),
    getCurrentUser(),
    searchParams,
  ]);

  const listings = storedListings.flatMap<VitrinaListing>((listing) => {
    const game = getCatalogGame(listing.catalogId);
    if (!game || !isPublicCatalogGame(game)) return [];
    const platform = getPlatform(game.platformSlug);
    const condition = normalizeLegacyCollectionCondition(listing.collectionCondition, listing.sealed);
    const region = getRegionDisplay(game.region);
    const sellerCover = listing.photos.find((photo) => photo.slot === "cover-front")?.url ?? null;
    const salePath = `/venta/${encodeURIComponent(listing.id)}`;
    return [{
      id: listing.id,
      catalogId: game.id,
      title: listing.customTitle?.trim() || game.title,
      catalogHref: catalogGamePath(game),
      contactHref: user ? salePath : `/login?next=${encodeURIComponent(salePath)}`,
      coverUrl: sellerCover ?? getCoverSrc(game.coverUrl, game.id),
      usesSellerPhoto: Boolean(sellerCover),
      photoCount: listing.photos.length,
      askingPriceEur: listingAskingPriceEur(listing),
      condition,
      conditionLabel: VITRINA_CONDITION_LABELS[condition],
      platformSlug: game.platformSlug,
      platformName: platform?.shortName || platform?.name || game.platformSlug.toUpperCase(),
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

  return (
    <>
      <SiteNav initialUser={user} />
      <VitrinaMarketplace
        listings={listings}
        initialFilters={initialFilters(params)}
      />
    </>
  );
}
