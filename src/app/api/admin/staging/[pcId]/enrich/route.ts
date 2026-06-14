import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { readCatalogStagingGame, writeCatalogStagingGame } from "@/lib/catalog-staging-storage";
import { enrichStagingGameFromPriceCharting } from "@/lib/pricecharting-enrich";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const game = await readCatalogStagingGame(pcId);
  if (!game) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const enriched = await enrichStagingGameFromPriceCharting(game);
  await writeCatalogStagingGame(enriched);

  return NextResponse.json({ ok: true, game: enriched });
}
