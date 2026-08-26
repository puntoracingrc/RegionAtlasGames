import { NextResponse } from "next/server";
import {
  MAX_COVER_UPLOAD_BYTES,
  uploadCoverToCdn,
  validateImageUploadEnvelope,
} from "@/lib/covers-upload";
import {
  draftFromStaging,
  readAdminGameDraft,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import {
  assertContributorApi,
  contributorCanEditReviewStatus,
  loadContributorStagingEntry,
} from "@/lib/contributor-access";

type RouteParams = { params: Promise<{ pcId: string }> };

function uploadError(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado al subir la portada.";
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const contributor = await assertContributorApi();
    if (!contributor) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const pcId = Number.parseInt((await params).pcId, 10);
    if (!Number.isFinite(pcId)) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const loaded = await loadContributorStagingEntry(pcId, contributor.email);
    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    if (!contributorCanEditReviewStatus(loaded.staging.reviewStatus)) {
      return NextResponse.json({ error: "No puedes cambiar la portada en revisión." }, { status: 403 });
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

    const existing = loaded.draft ?? (await readAdminGameDraft(pcId));
    const draft = draftFromStaging(loaded.staging, existing);
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

    draft.coverUrl = uploaded.coverUrl;
    draft.contributorEmail = contributor.email;
    draft.reviewStatus = "contributor-draft";
    const saved = await writeAdminGameDraft(draft);
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, coverUrl: uploaded.coverUrl, draft });
  } catch (error) {
    return NextResponse.json({ error: uploadError(error) }, { status: 500 });
  }
}
