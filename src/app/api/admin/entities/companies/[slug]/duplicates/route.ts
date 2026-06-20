import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { findAdminCompanyDuplicateCandidates } from "@/lib/admin-entity-catalog";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "12", 10);
  const result = await findAdminCompanyDuplicateCandidates(slug, { limit });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
