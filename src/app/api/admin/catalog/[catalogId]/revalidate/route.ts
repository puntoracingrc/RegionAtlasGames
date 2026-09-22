import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { getPublishedGameForAdmin } from "@/lib/admin-catalog-publish";
import { resolveCatalogIdParam } from "@/lib/catalog";
import { buildCatalogSeoSlug } from "@/lib/catalog-url";
import { revalidateCatalogOverlayGame } from "@/lib/catalog-runtime-overlay";
import { registerOverlayGame } from "@/lib/catalog-overlay-documents";

type RouteParams = { params: Promise<{ catalogId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = resolveCatalogIdParam((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const registeredFamily = await registerOverlayGame(resolved.game);
  revalidateCatalogOverlayGame(resolved.game);

  return NextResponse.json({
    ok: true,
    catalogId: resolved.game.id,
    url: `/catalogo/${buildCatalogSeoSlug(resolved.game)}`,
    familyCatalogIds: registeredFamily.workCatalogIds.length
      ? registeredFamily.workCatalogIds
      : registeredFamily.titleCatalogIds,
  });
}
