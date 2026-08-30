import { NextResponse } from "next/server";
import { blockConversation } from "@/lib/conversations";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "conversation-block",
    userId: user.id,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const result = await blockConversation({
    conversationId: id,
    blockerId: user.id,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
