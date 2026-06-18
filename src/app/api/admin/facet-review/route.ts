import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  applyAdminFacetReview,
  getAdminFacetReviewQueue,
} from "@/lib/admin-facet-review";

export async function GET(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  return NextResponse.json({
    ok: true,
    ...getAdminFacetReviewQueue({
      q: searchParams.get("q") ?? "",
      status: searchParams.get("status") ?? "",
      limit: Number(searchParams.get("limit") ?? 80),
    }),
  });
}

export async function PATCH(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await applyAdminFacetReview({
    gameIds: Array.isArray(body.gameIds)
      ? body.gameIds.filter((gameId: unknown): gameId is string => typeof gameId === "string")
      : [],
    subgenres: Array.isArray(body.subgenres)
      ? body.subgenres.filter((name: unknown): name is string => typeof name === "string")
      : [],
    facets: Array.isArray(body.facets)
      ? body.facets.filter((name: unknown): name is string => typeof name === "string")
      : [],
    mode: body.mode === "replace" ? "replace" : "append",
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, affectedCount: result.affectedCount });
}
