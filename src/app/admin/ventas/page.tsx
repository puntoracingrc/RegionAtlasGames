import { AdminMarketplaceReviewPanel } from "@/components/admin/admin-marketplace-review-panel";
import {
  getListingsNeedingVerification,
  getMarketplaceListingClientView,
} from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function AdminMarketplaceReviewPage() {
  const listings = await getListingsNeedingVerification(100);
  return (
    <AdminMarketplaceReviewPanel
      initialListings={listings.map(getMarketplaceListingClientView)}
    />
  );
}
