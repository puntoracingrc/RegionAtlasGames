import { NextResponse } from "next/server";
import { confirmBuyerReceipt, getListing, markListingSold } from "@/lib/listings";
import {
  findConversation,
  notifySaleCompleted,
  notifySaleMarked,
} from "@/lib/conversations";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "sale-update",
    userId: user.id,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const body = await request.json();
  const action = body.action as string;

  if (action === "seller-confirm") {
    const buyerId = String(body.buyerId ?? "").trim();
    const conv = await findConversation(id, buyerId);
    if (!conv || conv.sellerId !== user.id) {
      return NextResponse.json({ error: "Comprador no válido para este anuncio." }, { status: 400 });
    }

    const result = await markListingSold({
      listingId: id,
      sellerId: user.id,
      buyerId,
      buyerName: conv.buyerName,
      priceEur: Number(body.priceEur),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const listing = await getListing(id);
    if (listing) {
      await notifySaleMarked({
        listingId: listing.id,
        catalogId: listing.catalogId,
        buyerId,
        sellerId: user.id,
        title: listing.customTitle || listing.title,
        conversationId: conv.id,
      }).catch((error) => {
        console.error("[marketplace-sale] buyer notification projection failed", error);
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "buyer-confirm") {
    const listingBeforeConfirmation = await getListing(id);
    const conversationBeforeConfirmation = await findConversation(id, user.id);
    const result = await confirmBuyerReceipt({ listingId: id, buyerId: user.id });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (listingBeforeConfirmation?.sellerId && conversationBeforeConfirmation) {
      await notifySaleCompleted({
        listingId: listingBeforeConfirmation.id,
        catalogId: listingBeforeConfirmation.catalogId,
        sellerId: listingBeforeConfirmation.sellerId,
        buyerId: user.id,
        title: listingBeforeConfirmation.customTitle || listingBeforeConfirmation.title,
        conversationId: conversationBeforeConfirmation.id,
      }).catch((error) => {
        console.error("[marketplace-sale] seller notification projection failed", error);
      });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
