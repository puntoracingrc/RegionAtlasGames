import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/users";
import { readJsonBody } from "@/lib/request-security";
import { acknowledgeWishlistAchievements } from "@/lib/wishlist-store";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const body = await readJsonBody(request, 8192);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const ids = body.data.ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== "string" || id.length > 100)) {
    return NextResponse.json({ error: "Avisos no válidos." }, { status: 400 });
  }
  try {
    const achievements = await acknowledgeWishlistAchievements(user.id, ids as string[]);
    return NextResponse.json({ achievements }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo cerrar el aviso. Inténtalo de nuevo." }, { status: 503 });
  }
}
