import { NextResponse } from "next/server";
import { confirmBuyerReceipt, markListingSold } from "@/lib/listings";
import { findConversation } from "@/lib/conversations";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !canUseMarketplace(user.plan)) {
    return NextResponse.json({ error: "Plan Pro requerido." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const action = body.action as string;

  if (action === "seller-confirm") {
    const buyerId = String(body.buyerId ?? "").trim();
    const conv = findConversation(id, buyerId);
    if (!conv || conv.sellerId !== user.id) {
      return NextResponse.json({ error: "Comprador no válido para este anuncio." }, { status: 400 });
    }

    const result = markListingSold({
      listingId: id,
      sellerId: user.id,
      buyerId,
      buyerName: String(body.buyerName ?? conv.buyerName),
      priceEur: Number(body.priceEur),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "buyer-confirm") {
    const result = confirmBuyerReceipt({ listingId: id, buyerId: user.id });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
