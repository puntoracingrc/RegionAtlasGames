import { NextResponse } from "next/server";
import { addMessage, getConversation } from "@/lib/conversations";
import { getListing } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }
  if (conversation.buyerId !== user.id && conversation.sellerId !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const listing = getListing(conversation.listingId);
  return NextResponse.json({ conversation, listing });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Mensaje vacío." }, { status: 400 });
  }

  const result = addMessage({
    conversationId: id,
    senderId: user.id,
    senderName: user.name,
    body: message,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result });
}
