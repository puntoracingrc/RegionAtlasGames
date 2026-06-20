import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { deleteAdminCompany, setAdminEntityActive, updateAdminCompany } from "@/lib/admin-entity-catalog";

type RouteParams = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const body = (await request.json()) as {
    name?: string;
    newSlug?: string;
    active?: boolean;
    history?: string | null;
    logoUrl?: string | null;
    websiteUrl?: string | null;
    foundedYear?: number | null;
    closedYear?: number | null;
    status?: "active" | "defunct" | "subsidiary" | "unknown";
    isParentCompany?: boolean;
    parentCompany?: { slug: string; name: string } | null;
    acquiredByCompany?: { slug: string; name: string } | null;
    mergedWithCompany?: { slug: string; name: string } | null;
    predecessorCompany?: { slug: string; name: string } | null;
    successorCompany?: { slug: string; name: string } | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };
  if (typeof body.active === "boolean" && Object.keys(body).length === 1) {
    const result = await setAdminEntityActive("companies", slug, body.active);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, slug, active: body.active });
  }

  const result = await updateAdminCompany(slug, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, company: result.entry, slug: result.slug });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = decodeURIComponent((await params).slug);
  const result = await deleteAdminCompany(slug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
