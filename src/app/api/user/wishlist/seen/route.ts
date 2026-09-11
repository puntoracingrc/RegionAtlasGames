import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/users";
import { readJsonBody } from "@/lib/request-security";
import { markWishlistSalesSeen, type WishlistSeenView } from "@/lib/wishlist-sales-store";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401, headers });
  const body = await readJsonBody(request, 128 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status, headers });
  const views = body.data.views;
  if (!Array.isArray(views) || views.length > 24 || views.some((view) => !view || typeof view.catalogId !== "string" || view.catalogId.length > 300 || !Array.isArray(view.listingKeys) || view.listingKeys.length > 500 || view.listingKeys.some((key: unknown) => typeof key !== "string" || key.length > 150))) {
    return NextResponse.json({ error: "Avisos no válidos." }, { status: 400, headers });
  }
  try {
    return NextResponse.json({ sales: await markWishlistSalesSeen(user.id, views as WishlistSeenView[]) }, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo marcar el aviso como visto." }, { status: 503, headers });
  }
}
