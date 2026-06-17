import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { deleteAdminGenre, setAdminEntityActive, updateAdminGenre } from "@/lib/admin-entity-catalog";

type RouteParams = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const body = (await request.json()) as { name?: string; newSlug?: string; active?: boolean };
  if (typeof body.active === "boolean" && Object.keys(body).length === 1) {
    const result = await setAdminEntityActive("genres", slug, body.active);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, slug, active: body.active });
  }

  const result = await updateAdminGenre(slug, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, genre: result.entry, slug: result.slug });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const result = await deleteAdminGenre(slug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
