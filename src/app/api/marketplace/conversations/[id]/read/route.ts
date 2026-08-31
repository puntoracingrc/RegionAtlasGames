import { NextResponse } from "next/server";
import { markConversationRead } from "@/lib/conversations";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "conversation-read",
    userId: user.id,
    limit: 600,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const result = await markConversationRead({ conversationId: id, userId: user.id });
  if ("error" in result) {
    const status = result.error === "No autorizado." ? 403 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
