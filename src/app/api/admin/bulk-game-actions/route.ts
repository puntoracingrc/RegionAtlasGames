import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  bulkAssignAdminGames,
  getAdminBulkGameActionOptions,
  searchAdminBulkActionGames,
} from "@/lib/admin-series-manager";

export async function GET(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "games";

  if (mode === "options") {
    return NextResponse.json({ ok: true, options: getAdminBulkGameActionOptions() });
  }

  const games = await searchAdminBulkActionGames({
    q: searchParams.get("q") ?? "",
    limit: Number(searchParams.get("limit") ?? 80),
    platformSlug: searchParams.get("platformSlug") ?? undefined,
    region: searchParams.get("region") ?? undefined,
    genreSlug: searchParams.get("genreSlug") ?? undefined,
    facetSlug: searchParams.get("facetSlug") ?? undefined,
  });
  return NextResponse.json({ ok: true, games });
}

export async function PATCH(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "bulk-assign") {
    const result = await bulkAssignAdminGames({
      gameIds: Array.isArray(body.gameIds)
        ? body.gameIds.filter((gameId: unknown): gameId is string => typeof gameId === "string")
        : [],
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : [],
      facets: Array.isArray(body.facets)
        ? body.facets.filter((facet: unknown): facet is string => typeof facet === "string")
        : [],
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, affectedCount: result.affectedCount });
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
