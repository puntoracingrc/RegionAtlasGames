import { NextResponse } from "next/server";
import { enrichCollectionItem } from "@/lib/catalog";
import { linkCollectionItemToCatalog } from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const body = await request.json();
  const collectionItemId = String(body.collectionItemId ?? "").trim();
  if (!collectionItemId) {
    return NextResponse.json({ error: "Falta collectionItemId." }, { status: 400 });
  }

  const result = await linkCollectionItemToCatalog(user.id, collectionItemId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    item: enrichCollectionItem(result.item),
    linked: true,
  });
}
