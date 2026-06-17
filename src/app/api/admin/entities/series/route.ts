import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  createAdminSeries,
  listAdminSeriesGamePlatforms,
  listAdminSeries,
  searchAdminSeriesGames,
} from "@/lib/admin-series-manager";

export async function GET(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode");
  const q = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? 150);

  if (mode === "game-platforms") {
    return NextResponse.json({ ok: true, platforms: listAdminSeriesGamePlatforms() });
  }

  if (mode === "games") {
    const games = await searchAdminSeriesGames({
      q,
      limit,
      excludeSeriesSlug: searchParams.get("excludeSeriesSlug") ?? undefined,
      platformSlug: searchParams.get("platformSlug") ?? undefined,
    });
    return NextResponse.json({ ok: true, games });
  }

  const series = await listAdminSeries({ q, limit });
  return NextResponse.json({ ok: true, series });
}

export async function POST(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await createAdminSeries({
    name: typeof body.name === "string" ? body.name : "",
    slug: typeof body.slug === "string" ? body.slug : undefined,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, series: result.series });
}
