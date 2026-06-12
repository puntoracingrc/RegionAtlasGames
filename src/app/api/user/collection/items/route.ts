import { NextResponse } from "next/server";
import {
  addCatalogGameToCollection,
  getUserCollectionViews,
  removeCatalogGameFromCollection,
} from "@/lib/collection-store";
import { enrichCollectionItem } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/users";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para guardar juegos." }, { status: 401 });
  }

  const body = await request.json();
  const catalogId = String(body.catalogId ?? "").trim();
  if (!catalogId) {
    return NextResponse.json({ error: "Falta catalogId." }, { status: 400 });
  }

  const result = addCatalogGameToCollection(user.id, catalogId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    item: enrichCollectionItem(result.item),
    owned: true,
    ownedCatalogIds: getUserCollectionViews(user.id)
      .map((i) => i.catalogId)
      .filter(Boolean),
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const catalogId = searchParams.get("catalogId")?.trim();
  if (!catalogId) {
    return NextResponse.json({ error: "Falta catalogId." }, { status: 400 });
  }

  const result = removeCatalogGameFromCollection(user.id, catalogId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    removed: result.removed,
    owned: false,
    ownedCatalogIds: getUserCollectionViews(user.id)
      .map((i) => i.catalogId)
      .filter(Boolean),
  });
}
