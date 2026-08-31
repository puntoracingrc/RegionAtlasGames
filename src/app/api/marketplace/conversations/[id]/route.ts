import { NextResponse } from "next/server";
import { addMessage, getConversationWithUnread } from "@/lib/conversations";
import { getListing, getMarketplaceListingClientView } from "@/lib/listings";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const result = await getConversationWithUnread(id, user.id);
  if (!result) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }
  const { conversation, unreadCount } = result;
  if (conversation.buyerId !== user.id && conversation.sellerId !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const listing = await getListing(conversation.listingId);
  return NextResponse.json({
    conversation,
    unreadCount,
    listing: listing ? getMarketplaceListingClientView(listing) : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "message-send",
    userId: user.id,
    limit: 120,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const body = await request.json();
  const message = String(body.message ?? "").trim();
  const clientMutationId = String(body.clientMutationId ?? "").trim() || undefined;
  if (!message) {
    return NextResponse.json({ error: "Mensaje vacío." }, { status: 400 });
  }

  const result = await addMessage({
    conversationId: id,
    senderId: user.id,
    senderName: user.name,
    body: message,
    clientMutationId,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result });
}
