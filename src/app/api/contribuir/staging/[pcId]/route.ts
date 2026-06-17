import { NextResponse } from "next/server";
import { applyDraftPatch } from "@/lib/admin-draft-patch";
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

export async function GET(_request: Request, { params }: RouteParams) {
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

  const existing = loaded.draft ?? (await readAdminGameDraft(pcId));
  const draft = draftFromStaging(loaded.staging, existing);

  return NextResponse.json({ ok: true, staging: loaded.staging, draft });
}

export async function PATCH(request: Request, { params }: RouteParams) {
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
    return NextResponse.json(
      { error: "Esta ficha ya está en revisión y no se puede editar." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as Partial<Record<string, unknown>>;
  const existing = loaded.draft ?? (await readAdminGameDraft(pcId));
  const base = draftFromStaging(loaded.staging, existing);
  const draft = applyDraftPatch(base, body);
  draft.contributorEmail = contributor.email;
  draft.reviewStatus = "contributor-draft";

  const saved = await writeAdminGameDraft(draft);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draft });
}
