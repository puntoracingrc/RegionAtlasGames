import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  buildAdminTaxonomyTree,
  deleteAdminTaxonomyNode,
  readAdminTaxonomy,
  upsertAdminTaxonomyNode,
  type AdminTaxonomyLevel,
} from "@/lib/admin-taxonomy";

function parseLevel(value: unknown): AdminTaxonomyLevel | null {
  if (value === "main" || value === "subgenre" || value === "tag") return value;
  return null;
}

export async function GET() {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const taxonomy = await readAdminTaxonomy();
  return NextResponse.json({
    ok: true,
    taxonomy,
    tree: buildAdminTaxonomyTree(taxonomy),
  });
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const level = parseLevel(body.level);
  if (!level) return NextResponse.json({ error: "Nivel no válido." }, { status: 400 });

  const result = await upsertAdminTaxonomyNode({
    name: String(body.name ?? ""),
    slug: typeof body.slug === "string" ? body.slug : undefined,
    level,
    parentSlug: typeof body.parentSlug === "string" ? body.parentSlug : null,
    description: typeof body.description === "string" ? body.description : undefined,
    active: typeof body.active === "boolean" ? body.active : undefined,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    linkedGenreSlugs: Array.isArray(body.linkedGenreSlugs)
      ? body.linkedGenreSlugs.filter((value): value is string => typeof value === "string")
      : undefined,
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, node: result.node });
}

export async function PATCH(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const originalSlug = typeof body.originalSlug === "string" ? body.originalSlug : "";
  const level = parseLevel(body.level);
  if (!originalSlug) return NextResponse.json({ error: "Falta el elemento a editar." }, { status: 400 });
  if (!level) return NextResponse.json({ error: "Nivel no válido." }, { status: 400 });

  const result = await upsertAdminTaxonomyNode({
    originalSlug,
    name: String(body.name ?? ""),
    slug: typeof body.slug === "string" ? body.slug : undefined,
    level,
    parentSlug: typeof body.parentSlug === "string" ? body.parentSlug : null,
    description: typeof body.description === "string" ? body.description : undefined,
    active: typeof body.active === "boolean" ? body.active : undefined,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    linkedGenreSlugs: Array.isArray(body.linkedGenreSlugs)
      ? body.linkedGenreSlugs.filter((value): value is string => typeof value === "string")
      : undefined,
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, node: result.node });
}

export async function DELETE(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const result = await deleteAdminTaxonomyNode(slug);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
