import { NextResponse } from "next/server";
import { getListing, updateListing } from "@/lib/listings";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "listing-update",
    userId: user.id,
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Anuncio no encontrado." }, { status: 404 });
  }
  if (listing.status === "sold" || listing.status === "cancelled") {
    return NextResponse.json({ error: "Anuncio cerrado." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const customTitle = String(body.customTitle ?? "").trim();
  const customDescription = String(body.customDescription ?? "").trim();
  const sellerCity = String(body.sellerCity ?? "").trim();
  const saleOptions = {
    pickup: Boolean(body.saleOptions?.pickup),
    shipping: Boolean(body.saleOptions?.shipping),
  };

  if (customTitle && customTitle.length < 3) {
    return NextResponse.json({ error: "Título demasiado corto." }, { status: 400 });
  }
  if (customTitle.length > 120) {
    return NextResponse.json({ error: "Título demasiado largo." }, { status: 400 });
  }
  if (customDescription.length > 1200) {
    return NextResponse.json({ error: "Descripción demasiado larga." }, { status: 400 });
  }
  if (sellerCity && sellerCity.length < 2) {
    return NextResponse.json({ error: "Ciudad demasiado corta." }, { status: 400 });
  }
  if (!saleOptions.pickup && !saleOptions.shipping) {
    return NextResponse.json(
      { error: "Elige al menos trato en mano o envío." },
      { status: 400 },
    );
  }

  const updated = await updateListing(id, {
    customTitle: customTitle || null,
    customDescription: customDescription || null,
    sellerCity: sellerCity || user.city || null,
    saleOptions,
  });

  return NextResponse.json({ listing: updated });
}
