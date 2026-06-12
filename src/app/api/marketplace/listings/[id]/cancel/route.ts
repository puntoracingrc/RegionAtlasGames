import { NextResponse } from "next/server";
import { cancelListing, getListing } from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !canUseMarketplace(user.plan)) {
    return NextResponse.json({ error: "Plan Pro requerido." }, { status: 403 });
  }

  const { id } = await params;
  const listing = getListing(id);
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Anuncio no encontrado." }, { status: 404 });
  }
  if (listing.status === "sold") {
    return NextResponse.json({ error: "No se puede cancelar una venta cerrada." }, { status: 400 });
  }
  if (listing.status === "cancelled") {
    return NextResponse.json({ ok: true, listing });
  }

  const ok = cancelListing(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "No se pudo cancelar." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, listing: getListing(id) });
}
