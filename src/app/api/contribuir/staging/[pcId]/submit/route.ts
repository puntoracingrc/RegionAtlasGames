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
import { writeCatalogStagingGame } from "@/lib/catalog-staging-storage";

type RouteParams = { params: Promise<{ pcId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
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
    return NextResponse.json({ error: "Esta ficha ya fue enviada a revisión." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Record<string, unknown>>;
  const existing = loaded.draft ?? (await readAdminGameDraft(pcId));
  const base = draftFromStaging(loaded.staging, existing);
  const draft = applyDraftPatch(base, body);

  if (!draft.title?.trim()) {
    return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  }

  const submittedAt = new Date().toISOString();
  draft.contributorEmail = contributor.email;
  draft.reviewStatus = "pending-review";
  draft.submittedAt = submittedAt;

  const saved = await writeAdminGameDraft(draft);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  await writeCatalogStagingGame({
    ...loaded.staging,
    title: draft.title,
    titlePc: draft.titlePc,
    platformSlug: draft.platformSlug,
    region: draft.region,
    coverUrl: draft.coverUrl,
    catalogId: draft.catalogId,
    contributorEmail: contributor.email,
    reviewStatus: "pending-review",
    submittedAt,
    lastSeenAt: submittedAt,
  });

  return NextResponse.json({
    ok: true,
    redirect: "/contribuir",
    message: "Ficha enviada a revisión del administrador.",
  });
}
