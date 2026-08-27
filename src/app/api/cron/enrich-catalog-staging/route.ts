import { NextResponse } from "next/server";
import { enrichCatalogStagingBatch } from "@/lib/catalog-staging-enrich";
import {
  catalogStagingStorageBackend,
  readCatalogStagingIndex,
} from "@/lib/catalog-staging-storage";
import { cronRequestAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronRequestAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(8, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "4", 10) || 4));

  try {
    const enrich = await enrichCatalogStagingBatch({
      limit,
      delayMs: 250,
      budgetMs: 45_000,
      scanLimit: 96,
      fetchTimeoutMs: 8_000,
    });
    const index = await readCatalogStagingIndex({ fresh: true });
    const summary = {
      updatedAt: index.updatedAt,
      totalGames: index.pcIds.length,
      byPlatform: index.byPlatform,
      backend: catalogStagingStorageBackend(),
    };
    console.info("[catalog-staging-cron]", JSON.stringify({ ok: true, ...enrich }));

    return NextResponse.json({
      ok: true,
      enrich,
      summary,
    });
  } catch (error) {
    console.error("[catalog-staging-cron]", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo completar el enriquecimiento de staging." },
      { status: 500 },
    );
  }
}
