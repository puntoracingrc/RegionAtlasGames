import { NextResponse } from "next/server";
import {
  addCatalogGameToCollection,
  getUserCollectionViews,
  removeCatalogGameFromCollection,
  removeOneCatalogGameFromCollection,
} from "@/lib/collection-store";
import { enrichCollectionItem } from "@/lib/catalog";
import { getSellerListings } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";
import { defaultCollectionConditionForPlatform } from "@/lib/collection-condition-policy";
import { getCatalogGame } from "@/lib/catalog";

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

  let result: Awaited<ReturnType<typeof addCatalogGameToCollection>>;
  try {
    const game = getCatalogGame(catalogId);
    const initialCondition = defaultCollectionConditionForPlatform(
      user.collectionDefaultConditions,
      game?.platformSlug ?? "",
    );
    result = await addCatalogGameToCollection(user.id, catalogId, initialCondition);
  } catch (error) {
    console.error("[collection/items] POST failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: detail || "No se pudo guardar en tu colección." },
      { status: 503 },
    );
  }

  if ("error" in result) {
    const status = result.error.includes("guardar") ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const views = await getUserCollectionViews(user.id);
  const ownedCount = views
    .filter((item) => item.catalogId === catalogId)
    .reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);

  return NextResponse.json({
    item: enrichCollectionItem(result.item),
    owned: true,
    linkedExisting: result.linkedExisting,
    ownedCount,
    ownedCatalogIds: [
      ...new Set(views.map((item) => item.catalogId).filter((id): id is string => Boolean(id))),
    ],
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const catalogId = searchParams.get("catalogId")?.trim();
  const mode = searchParams.get("mode")?.trim();
  if (!catalogId) {
    return NextResponse.json({ error: "Falta catalogId." }, { status: 400 });
  }

  const result =
    mode === "one"
      ? await removeOneCatalogGameFromCollection(
          user.id,
          catalogId,
          (await getSellerListings(user.id))
            .filter(
              (listing) =>
                listing.catalogId === catalogId &&
                (listing.status === "active" || listing.status === "draft"),
            )
            .map((listing) => listing.collectionItemId),
        )
      : await removeCatalogGameFromCollection(user.id, catalogId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const views = await getUserCollectionViews(user.id);
  const ownedCount = views
    .filter((item) => item.catalogId === catalogId)
    .reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);
  return NextResponse.json({
    removed: result.removed,
    owned: ownedCount > 0,
    ownedCount,
    ownedCatalogIds: [
      ...new Set(views.map((item) => item.catalogId).filter((id): id is string => Boolean(id))),
    ],
  });
}
