import { NextResponse } from "next/server";
import { findConversation, getUserConversations, startConversation } from "@/lib/conversations";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";
import { getListing } from "@/lib/listings";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canUseMarketplace(user.plan)) {
    return NextResponse.json({ error: "Plan Pro requerido." }, { status: 403 });
  }

  const conversations = getUserConversations(user.id).map((conv) => {
    const listing = getListing(conv.listingId);
    const last = conv.messages[conv.messages.length - 1];
    const role = conv.sellerId === user.id ? "seller" : "buyer";
    const peerName = role === "seller" ? conv.buyerName : conv.sellerName;

    return {
      id: conv.id,
      listingId: conv.listingId,
      catalogId: conv.catalogId,
      title: listing?.title ?? "Anuncio",
      listingStatus: listing?.status ?? null,
      role,
      peerName,
      messageCount: conv.messages.length,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.createdAt ?? conv.updatedAt,
      updatedAt: conv.updatedAt,
    };
  });

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canUseMarketplace(user.plan)) {
    return NextResponse.json({ error: "Plan Pro requerido." }, { status: 403 });
  }

  const body = await request.json();
  const listingId = String(body.listingId ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "Falta listingId." }, { status: 400 });
  }

  const result = startConversation({
    listingId,
    buyerId: user.id,
    buyerName: user.name,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ conversation: result });
}
