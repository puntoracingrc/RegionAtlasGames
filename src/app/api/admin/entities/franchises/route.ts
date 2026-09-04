import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  createAdminFranchise,
  getAdminGameFranchiseContext,
  getAdminSeriesFranchiseContext,
  listAdminFranchises,
  listAdminSeriesOptions,
} from "@/lib/admin-franchise-manager";

export async function GET(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode");
  if (mode === "series-options") {
    return NextResponse.json({ ok: true, series: await listAdminSeriesOptions() });
  }
  if (mode === "series-context") {
    const result = await getAdminSeriesFranchiseContext(searchParams.get("seriesSlug") ?? "");
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true, context: result });
  }
  if (mode === "game-context") {
    const result = await getAdminGameFranchiseContext(searchParams.get("gameId") ?? "");
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true, context: result });
  }

  const franchises = await listAdminFranchises({ q: searchParams.get("q") ?? "" });
  return NextResponse.json({ ok: true, franchises });
}

export async function POST(req: Request) {
  const admin = await assertAdminApi();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await createAdminFranchise({
    name: typeof body.name === "string" ? body.name : "",
    slug: typeof body.slug === "string" ? body.slug : undefined,
    description: typeof body.description === "string" ? body.description : null,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, franchise: result }, { status: 201 });
}
