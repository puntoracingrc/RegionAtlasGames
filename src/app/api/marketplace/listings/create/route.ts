import { NextResponse } from "next/server";
import { createListingDraft } from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  if (!canUseMarketplace(user.plan)) {
    return NextResponse.json(
      { error: "El mercado requiere plan Pro." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const collectionItemId = String(body.collectionItemId ?? "").trim();
  if (!collectionItemId) {
    return NextResponse.json({ error: "Falta collectionItemId." }, { status: 400 });
  }

  const result = createListingDraft({
    sellerId: user.id,
    sellerName: user.name,
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
