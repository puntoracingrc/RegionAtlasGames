import { notFound, redirect } from "next/navigation";
import { ListingManageClient } from "@/components/listing-manage-client";
import { aiQuotaRemaining } from "@/lib/ai-listing-analysis";
import { catalogGamePath } from "@/lib/catalog-url";
import { collectionCatalogPath } from "@/lib/collection-path";
import { getListing, getMarketplaceListingClientView } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ id: string }> };

export default async function ListingPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  const isOwner = listing.sellerId === user.id;
  const isBuyer = listing.soldToUserId === user.id;
  const isActiveBuyer = listing.status === "active" && !isOwner;
  const isParticipant = isOwner || isActiveBuyer || isBuyer;

  if (!isParticipant) {
    notFound();
  }

  return (
    <ListingManageClient
      key={listing.updatedAt}
      listing={getMarketplaceListingClientView(listing)}
      isOwner={isOwner}
      quotaRemaining={await aiQuotaRemaining(user.id, user.plan)}
      catalogHref={isOwner ? collectionCatalogPath(listing.catalogId) : catalogGamePath(listing.catalogId)}
    />
  );
}
