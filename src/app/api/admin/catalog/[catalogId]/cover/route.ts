import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  MAX_COVER_UPLOAD_BYTES,
  uploadCoverToCdn,
  validateImageUploadEnvelope,
} from "@/lib/covers-upload";
import {
  applyDraftPatch,
  draftFromCatalogGame,
  getPublishedGameForAdmin,
  updatePublishedCatalogGame,
} from "@/lib/admin-catalog-publish";

type RouteParams = { params: Promise<{ catalogId: string }> };

function uploadError(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado al subir la portada.";
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    if (!(await assertAdminApi())) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const catalogId = decodeURIComponent((await params).catalogId);
    const resolved = await getPublishedGameForAdmin(catalogId);
    if (!resolved) {
      return NextResponse.json({ error: "Juego no encontrado." }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo de portada." }, { status: 400 });
    }
    const envelopeError = validateImageUploadEnvelope(file, MAX_COVER_UPLOAD_BYTES);
    if (envelopeError) {
      return NextResponse.json(
        { error: envelopeError },
        { status: file.size > MAX_COVER_UPLOAD_BYTES ? 413 : 415 },
      );
    }

    const draft = draftFromCatalogGame(resolved.game, resolved.details);
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploaded = await uploadCoverToCdn({
      platformSlug: draft.platformSlug,
      slug: draft.slug,
      catalogId: draft.catalogId,
      fileBuffer: buffer,
      mimeType: file.type,
    });

    if ("error" in uploaded) {
      return NextResponse.json({ error: uploaded.error }, { status: 502 });
    }

    const nextDraft = applyDraftPatch(draft, { coverUrl: uploaded.coverUrl });
    const saved = await updatePublishedCatalogGame(catalogId, nextDraft);
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      coverUrl: uploaded.coverUrl,
      draft: nextDraft,
      catalogId: saved.catalogId,
    });
  } catch (error) {
    return NextResponse.json({ error: uploadError(error) }, { status: 500 });
  }
}
