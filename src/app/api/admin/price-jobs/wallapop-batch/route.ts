import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { startAdminPriceCollectJob } from "@/lib/admin-price-collect";
import { getCatalogGame } from "@/lib/catalog";

const MAX_GAMES = 20;

function cleanCatalogIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id) || id.length > 240 || /[\u0000-\u001f\u007f]/.test(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function POST(request: Request) {
  try {
    if (!(await assertAdminApi())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const catalogIds = cleanCatalogIds(body?.catalogIds);
    if (catalogIds.length === 0 || catalogIds.length > MAX_GAMES) {
      return NextResponse.json(
        { error: `Selecciona entre 1 y ${MAX_GAMES} juegos.` },
        { status: 400 },
      );
    }

    const games = catalogIds.map((catalogId) => getCatalogGame(catalogId));
    const missing = catalogIds.filter((_catalogId, index) => !games[index]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `No existen en el catálogo: ${missing.join(", ")}` },
        { status: 400 },
      );
    }
    const platformSlugs = new Set(games.map((game) => game?.platformSlug));
    if (platformSlugs.size !== 1) {
      return NextResponse.json(
        { error: "Todos los juegos deben pertenecer a la misma plataforma." },
        { status: 400 },
      );
    }

    const estimateMinutes = Number(body?.estimateMinutes ?? 0) || Math.max(10, catalogIds.length * 2);
    const started = await startAdminPriceCollectJob({
      catalogIds,
      source: "wallapop",
      estimateMinutes,
    });
    if ("error" in started) {
      return NextResponse.json({ error: started.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      jobId: started.jobId,
      catalogIds,
      platformSlug: games[0]?.platformSlug,
      estimateMinutes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo lanzar la tanda Wallapop." },
      { status: 500 },
    );
  }
}
