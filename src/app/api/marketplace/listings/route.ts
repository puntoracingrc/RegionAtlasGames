import { NextResponse } from "next/server";
import { getActiveListingsForCatalog, getPublicSellerListing } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const catalogId = searchParams.get("catalogId");
  if (!catalogId) {
    return NextResponse.json({ error: "Falta catalogId." }, { status: 400 });
  }

  const user = await getCurrentUser();
  const listings = getActiveListingsForCatalog(catalogId).map(getPublicSellerListing);

  return NextResponse.json({
    count: listings.length,
    listings,
    canContact: user?.plan === "pro",
  });
}
