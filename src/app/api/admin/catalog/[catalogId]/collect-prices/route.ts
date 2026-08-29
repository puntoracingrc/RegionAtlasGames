import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { resolveCatalogIdParam } from "@/lib/catalog";
import { getPublishedGameForAdmin } from "@/lib/admin-catalog-publish";
import { startAdminPriceCollectJob } from "@/lib/admin-price-collect";

type RouteParams = { params: Promise<{ catalogId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    if (!(await assertAdminApi())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const catalogId = resolveCatalogIdParam((await params).catalogId);
    const resolved = await getPublishedGameForAdmin(catalogId);
    if (!resolved) {
      return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
    }

    const started = await startAdminPriceCollectJob({ catalogId });
    if ("error" in started) {
      return NextResponse.json({ error: started.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      jobId: started.jobId,
      catalogId,
      platformSlug: resolved.game.platformSlug,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo iniciar la recolección." },
      { status: 500 },
    );
  }
}
