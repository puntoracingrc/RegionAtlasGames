import { NextResponse } from "next/server";
import { enrichCollectionItem } from "@/lib/catalog";
import {
  addCatalogCopy,
  removeUserCollectionItem,
} from "@/lib/collection-store";
import { updateCollectionCopyDetails } from "@/lib/collection-copy-details";
import { getSellerOpenListingForCollectionItem } from "@/lib/listings";
import type { CollectionCondition } from "@/lib/types";
import { getCurrentUser } from "@/lib/users";
import {
  defaultCollectionConditionForPlatform,
  isPricedCollectionCondition,
} from "@/lib/collection-condition-policy";
import { getCatalogGame } from "@/lib/catalog";

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

  const game = getCatalogGame(catalogId);
  const result = await addCatalogCopy(
    user.id,
    catalogId,
    defaultCollectionConditionForPlatform(
      user.collectionDefaultConditions,
      game?.platformSlug ?? "",
    ),
  );
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
  const collectionCondition = String(body.collectionCondition ?? "") as CollectionCondition;
  if (!isPricedCollectionCondition(collectionCondition)) {
    return NextResponse.json({ error: "Elige un estado válido." }, { status: 400 });
  }
  const buyPriceRaw = String(body.buyPrice ?? "").trim();
  const ownerEstimatedPriceRaw = String(body.ownerEstimatedPrice ?? "").trim();
  const purchasedAt = isoDate(body.purchasedAt);
  const addedAt = Object.prototype.hasOwnProperty.call(body, "addedAt")
    ? isoDate(body.addedAt) ?? "invalid"
    : undefined;
  const result = await updateCollectionCopyDetails(user.id, itemId, {
    collectionCondition,
    buyPrice: buyPriceRaw ? Number(buyPriceRaw) : null,
    ownerEstimatedPrice: ownerEstimatedPriceRaw ? Number(ownerEstimatedPriceRaw) : null,
    purchasedAt,
    addedAt,
    notes: String(body.notes ?? "").trim() || null,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    item: enrichCollectionItem(result.item),
    draftSynced: result.draftSynced,
  });
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
