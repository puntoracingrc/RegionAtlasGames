import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { removeContributor } from "@/lib/admin-contributors";

type RouteParams = { params: Promise<{ email: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const email = decodeURIComponent((await params).email);
  const result = await removeContributor(email);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
