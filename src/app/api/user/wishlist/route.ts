import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/users";
import { readJsonBody } from "@/lib/request-security";
import { readUserWishlist, setCatalogGameWished } from "@/lib/wishlist-store";
import { readWishlistSales } from "@/lib/wishlist-sales-store";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ver tus deseados." }, { status: 401, headers });
  try {
    const state = await readUserWishlist(user.id);
    return NextResponse.json({ ...state, sales: await readWishlistSales(user.id, state.wishlist) }, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo leer tu lista de deseados." }, { status: 503, headers });
  }
}

async function change(request: Request, wished: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para guardar tus deseados." }, { status: 401, headers });
  const body = await readJsonBody(request, 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status, headers });
  const catalogId = typeof body.data.catalogId === "string" ? body.data.catalogId.trim() : "";
  if (!catalogId || catalogId.length > 300) return NextResponse.json({ error: "Indica un juego válido." }, { status: 400, headers });
  try {
    const result = await setCatalogGameWished(user.id, catalogId, wished);
    return "error" in result
      ? NextResponse.json({ error: result.error }, { status: result.status, headers })
      : NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar tu lista de deseados. Inténtalo de nuevo." }, { status: 503, headers });
  }
}

export const POST = (request: Request) => change(request, true);
export const DELETE = (request: Request) => change(request, false);
