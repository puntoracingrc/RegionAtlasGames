import {
  CatalogOffersList,
  type MarketplaceCatalogOffer,
} from "@/components/catalog-offers-list";
import {
  countActiveListingsForCatalog,
  getActiveListingsForCatalog,
  getPublicSellerListing,
} from "@/lib/listings";
import {
  listingAnalysisHasVerifiedEstimate,
  listingVerificationLabel,
} from "@/lib/marketplace-verification";
import { getCurrentUser } from "@/lib/users";

type Props = { catalogId: string };

const COLLECTION_CONDITION_LABELS = {
  sealed: "Precintado",
  complete: "Completo",
  "game-manual": "Juego + manual",
  loose: "Suelto",
} as const;

export async function CatalogMarketplacePanel({ catalogId }: Props) {
  const [listings, user] = await Promise.all([
    getActiveListingsForCatalog(catalogId),
    getCurrentUser(),
  ]);
  const marketplaceOffers: MarketplaceCatalogOffer[] = listings.map((listing) => {
    const publicListing = getPublicSellerListing(listing);
    const verifiedEstimate = listingAnalysisHasVerifiedEstimate(listing.aiAnalysis);
    const storedCondition = listing.collectionCondition ?? (listing.sealed ? "sealed" : "unknown");
    return {
      id: listing.id,
      title: publicListing.title,
      sellerName: publicListing.sellerName,
      sellerCity: publicListing.sellerCity,
      photoUrl:
        listing.photos.find((photo) => photo.slot === "cover-front")?.url ??
        listing.photos[0]?.url ??
        null,
      askingPriceEur: publicListing.askingPriceEur,
      conditionLabel: storedCondition !== "unknown"
        ? COLLECTION_CONDITION_LABELS[storedCondition]
        : verifiedEstimate && publicListing.aiAnalysis?.conditionVerdict
          ? publicListing.aiAnalysis.conditionVerdict
          : listingVerificationLabel(listing.aiAnalysis),
      publishedAt: publicListing.publishedAt,
      saleOptions: publicListing.saleOptions,
      sellerLocation: publicListing.sellerLocation,
    };
  });

  return (
    <CatalogOffersList
      catalogId={catalogId}
      marketplaceOffers={marketplaceOffers}
      canContact={Boolean(user)}
    />
  );
}

export async function catalogListingCount(catalogId: string) {
  return countActiveListingsForCatalog(catalogId);
}
