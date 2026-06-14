import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { uploadCoverToCdn } from "@/lib/covers-upload";
import {
  draftFromStaging,
  readAdminGameDraft,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
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

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo de portada." }, { status: 400 });
  }

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploaded = await uploadCoverToCdn({
    platformSlug: draft.platformSlug,
    slug: draft.slug,
    fileBuffer: buffer,
    mimeType: file.type,
  });

  if ("error" in uploaded) {
    return NextResponse.json({ error: uploaded.error }, { status: 502 });
  }

  draft.coverUrl = uploaded.coverUrl;
  const saved = await writeAdminGameDraft(draft);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, coverUrl: uploaded.coverUrl, draft });
}
