import { NextResponse } from "next/server";
import { cancelListing, getListing } from "@/lib/listings";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "listing-cancel",
    userId: user.id,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Anuncio no encontrado." }, { status: 404 });
  }
  if (listing.status === "sold") {
    return NextResponse.json({ error: "No se puede cancelar una venta cerrada." }, { status: 400 });
  }
  if (listing.status === "cancelled") {
    return NextResponse.json({ ok: true, listing });
  }

  const ok = await cancelListing(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "No se pudo cancelar." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, listing: await getListing(id) });
}
