import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { revertLastAdminCompanyMerge } from "@/lib/admin-entity-catalog";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const targetSlug = decodeURIComponent((await params).slug);
  const result = await revertLastAdminCompanyMerge(targetSlug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
