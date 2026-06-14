import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromStaging,
  readAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { publishAdminGameDraft } from "@/lib/admin-catalog-publish";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const pcId = Number.parseInt((await params).pcId, 10);
  if (!Number.isFinite(pcId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
  }

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);

  if (!draft.title?.trim()) {
    return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  }
  if (!draft.slug?.trim()) {
    return NextResponse.json({ error: "Falta el slug." }, { status: 400 });
  }

  const result = await publishAdminGameDraft(draft);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
