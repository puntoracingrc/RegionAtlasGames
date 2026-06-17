import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { searchAdminCatalogGames } from "@/lib/admin-catalog-publish";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Number.parseInt(searchParams.get("limit") ?? "40", 10);
  const games = await searchAdminCatalogGames(q, limit);

  return NextResponse.json({ ok: true, games });
}
