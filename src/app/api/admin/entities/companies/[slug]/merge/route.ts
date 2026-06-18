import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { mergeAdminCompany } from "@/lib/admin-entity-catalog";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const sourceSlug = decodeURIComponent((await params).slug);
  const body = (await request.json()) as { targetSlug?: string };
  const targetSlug = body.targetSlug?.trim();
  if (!targetSlug) {
    return NextResponse.json({ error: "Falta la compañía destino." }, { status: 400 });
  }

  const result = await mergeAdminCompany(sourceSlug, targetSlug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
