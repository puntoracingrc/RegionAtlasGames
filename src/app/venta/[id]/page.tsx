import { notFound, redirect } from "next/navigation";
import { ListingManageClient } from "@/components/listing-manage-client";
import { aiQuotaRemaining } from "@/lib/ai-listing-analysis";
import { catalogGamePath } from "@/lib/catalog-url";
import { getListing } from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ id: string }> };

export default async function ListingPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canUseMarketplace(user.plan)) redirect("/ajustes");

  const { id } = await params;
  const listing = getListing(id);
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
      listing={listing}
      isOwner={isOwner}
      quotaRemaining={aiQuotaRemaining(user.id, user.plan)}
      catalogHref={catalogGamePath(listing.catalogId)}
    />
  );
}
