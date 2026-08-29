import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { resolveCatalogIdParam } from "@/lib/catalog";
import {
  getPublishedGameForAdmin,
  priceFieldsFromGame,
  updatePublishedCatalogPrices,
} from "@/lib/admin-catalog-publish";

type RouteParams = { params: Promise<{ catalogId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = resolveCatalogIdParam((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    catalogId,
    prices: priceFieldsFromGame(resolved.game),
    updatedAt: resolved.game.updatedAt,
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = resolveCatalogIdParam((await params).catalogId);
  const body = (await request.json()) as Partial<Record<string, unknown>>;
  const result = await updatePublishedCatalogPrices(catalogId, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
