import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { createAdminCompany, listAdminCompanies } from "@/lib/admin-entity-catalog";

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const limit = Number.parseInt(searchParams.get("limit") ?? "150", 10);

  const companies = await listAdminCompanies({ q, limit });
  return NextResponse.json({ ok: true, companies });
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as {
    slug?: string;
    name?: string;
    history?: string | null;
    logoUrl?: string | null;
    websiteUrl?: string | null;
    foundedYear?: number | null;
    closedYear?: number | null;
    status?: "active" | "defunct" | "subsidiary" | "unknown";
    parentCompany?: { slug: string; name: string } | null;
    acquiredByCompany?: { slug: string; name: string } | null;
    mergedWithCompany?: { slug: string; name: string } | null;
    predecessorCompany?: { slug: string; name: string } | null;
    successorCompany?: { slug: string; name: string } | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }
  const result = await createAdminCompany({
    name: body.name.trim(),
    slug: body.slug,
    history: body.history ?? null,
    logoUrl: body.logoUrl ?? null,
    websiteUrl: body.websiteUrl ?? null,
    foundedYear: body.foundedYear ?? null,
    closedYear: body.closedYear ?? null,
    status: body.status,
    parentCompany: body.parentCompany ?? null,
    acquiredByCompany: body.acquiredByCompany ?? null,
    mergedWithCompany: body.mergedWithCompany ?? null,
    predecessorCompany: body.predecessorCompany ?? null,
    successorCompany: body.successorCompany ?? null,
    seoTitle: body.seoTitle ?? null,
    seoDescription: body.seoDescription ?? null,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, company: result.entry });
}
