import { NextResponse } from "next/server";
import { enrichCollectionItem } from "@/lib/catalog";
import {
  addCatalogCopy,
  getUserCollectionItem,
  removeUserCollectionItem,
  updateUserCollectionItemDetails,
} from "@/lib/collection-store";
import { getSellerOpenListingForCollectionItem } from "@/lib/listings";
import type { CollectionCondition } from "@/lib/types";
import { getCurrentUser } from "@/lib/users";

function isoDate(value: unknown, required = false): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? new Date().toISOString() : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "invalid";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const body = await request.json();
  const catalogId = String(body.catalogId ?? "").trim();
  if (!catalogId) return NextResponse.json({ error: "Falta catalogId." }, { status: 400 });

  const result = await addCatalogCopy(user.id, catalogId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ item: enrichCollectionItem(result.item) });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const body = await request.json();
  const itemId = String(body.itemId ?? "").trim();
  const current = itemId ? await getUserCollectionItem(user.id, itemId) : undefined;
  if (!current) {
    return NextResponse.json({ error: "Copia no encontrada en tu colección." }, { status: 404 });
  }

  const collectionCondition = String(body.collectionCondition ?? "unknown") as CollectionCondition;
  const currentCondition = current.sealed ? "sealed" : current.collectionCondition ?? "unknown";
  const openListing = await getSellerOpenListingForCollectionItem(user.id, itemId);
  if (openListing && collectionCondition !== currentCondition) {
    return NextResponse.json(
      { error: "Retira el anuncio antes de cambiar el estado de esta copia." },
      { status: 409 },
    );
  }

  const buyPriceRaw = String(body.buyPrice ?? "").trim();
  const purchasedAt = isoDate(body.purchasedAt);
  const addedAt = isoDate(body.addedAt, true);
  const result = await updateUserCollectionItemDetails(user.id, itemId, {
    collectionCondition,
    buyPrice: buyPriceRaw ? Number(buyPriceRaw) : null,
    purchasedAt,
    addedAt: addedAt ?? "invalid",
    notes: String(body.notes ?? "").trim() || null,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ item: enrichCollectionItem(result.item) });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const itemId = new URL(request.url).searchParams.get("itemId")?.trim() ?? "";
  if (!itemId) return NextResponse.json({ error: "Falta itemId." }, { status: 400 });

  const openListing = await getSellerOpenListingForCollectionItem(user.id, itemId);
  const result = await removeUserCollectionItem(
    user.id,
    itemId,
    openListing ? [itemId] : [],
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json(result);
}
