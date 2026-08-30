import { NextResponse } from "next/server";
import { createListingDraft } from "@/lib/listings";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "listing-create",
    userId: user.id,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;
  const body = await request.json();
  const collectionItemId = String(body.collectionItemId ?? "").trim();
  if (!collectionItemId) {
    return NextResponse.json({ error: "Falta collectionItemId." }, { status: 400 });
  }

  const result = await createListingDraft({
    sellerId: user.id,
    sellerName: user.name,
    sellerCity: user.city,
    collectionItemId,
  });

  if ("error" in result) {
    return NextResponse.json(
      {
        error: result.error,
        existingListingId: "existingListingId" in result ? result.existingListingId : undefined,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ listing: result });
}
