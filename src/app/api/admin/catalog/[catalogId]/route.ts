import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { resolveCatalogIdParam } from "@/lib/catalog";
import { applyDraftPatch, draftFromCatalogGame, getPublishedGameForAdmin } from "@/lib/admin-catalog-publish";

type RouteParams = { params: Promise<{ catalogId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = resolveCatalogIdParam((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const draft = draftFromCatalogGame(resolved.game, resolved.details);
  return NextResponse.json({ ok: true, draft, game: resolved.game });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = resolveCatalogIdParam((await params).catalogId);
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const body = (await request.json()) as Partial<Record<string, unknown>>;
  const current = draftFromCatalogGame(resolved.game, resolved.details);
  const draft = applyDraftPatch(current, body);

  const { updatePublishedCatalogGame } = await import("@/lib/admin-catalog-publish");
  const result = await updatePublishedCatalogGame(catalogId, draft);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    draft,
    catalogId: result.catalogId,
    previousCatalogId: result.previousCatalogId,
    url: result.url,
    mode: result.mode,
    redirect:
      result.catalogId !== result.previousCatalogId
        ? `/admin/juegos/${encodeURIComponent(result.catalogId)}`
        : undefined,
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const catalogId = resolveCatalogIdParam((await params).catalogId);
  const { deletePublishedCatalogGame } = await import("@/lib/admin-catalog-publish");
  const result = await deletePublishedCatalogGame(catalogId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, redirect: "/admin/juegos" });
}
