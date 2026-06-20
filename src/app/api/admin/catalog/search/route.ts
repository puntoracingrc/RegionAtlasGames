import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { listAdminCatalogSearchFilters, searchAdminCatalogGames } from "@/lib/admin-catalog-publish";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("filters") === "1") {
    const filters = await listAdminCatalogSearchFilters();
    return NextResponse.json({ ok: true, ...filters });
  }

  const q = searchParams.get("q") ?? "";
  const limit = Number.parseInt(searchParams.get("limit") ?? "40", 10);
  const platformSlug = searchParams.get("platformSlug") ?? "";
  const region = searchParams.get("region") ?? "";
  const games = await searchAdminCatalogGames(q, limit, { platformSlug, region });

  return NextResponse.json({ ok: true, games });
}
