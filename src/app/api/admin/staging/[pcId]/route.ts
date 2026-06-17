import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { applyDraftPatch } from "@/lib/admin-draft-patch";
import {
  draftFromStaging,
  readAdminGameDraft,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { deleteAdminStagingEntry } from "@/lib/admin-catalog-publish";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return NextResponse.json({ error: "Juego no encontrado en cola." }, { status: 404 });
  }

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);

  return NextResponse.json({ ok: true, staging, draft });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return NextResponse.json({ error: "Juego no encontrado en cola." }, { status: 404 });
  }

  const body = (await request.json()) as Partial<Record<string, unknown>>;
  const existing = await readAdminGameDraft(pcId);
  const base = draftFromStaging(staging, existing);
  const draft = applyDraftPatch(base, body);

  const saved = await writeAdminGameDraft(draft);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draft });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  const draft = await readAdminGameDraft(pcId);
  if (!staging && !draft) {
    return NextResponse.json({ error: "Ficha no encontrada." }, { status: 404 });
  }

  let deletePublished = true;
  try {
    const body = (await request.json()) as { deletePublished?: boolean };
    if (body.deletePublished === false) deletePublished = false;
  } catch {
    /* body opcional */
  }

  const result = await deleteAdminStagingEntry({
    pcId,
    catalogId: draft?.catalogId ?? staging?.catalogId ?? null,
    deletePublished,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    redirect: "/admin/cola",
    deletedCatalogId:
      result.deletedCatalog && "ok" in result.deletedCatalog
        ? result.deletedCatalog.catalogId
        : null,
  });
}
