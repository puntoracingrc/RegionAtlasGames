import { after, NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromStaging,
  readAdminGameDraft,
} from "@/lib/admin-draft-storage";
import { publishAdminGameDraft } from "@/lib/admin-catalog-publish";
import { readCatalogStagingGame } from "@/lib/catalog-staging-storage";
import { createAdminPublishJob, runAdminPublishJob } from "@/lib/admin-publish-jobs";

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

  const existing = await readAdminGameDraft(pcId);
  const draft = draftFromStaging(staging, existing);

  if (!draft.title?.trim()) {
    return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  }
  if (!draft.slug?.trim()) {
    return NextResponse.json({ error: "Falta el slug." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (body?.background === true) {
    const job = await createAdminPublishJob(draft);
    after(async () => {
      await runAdminPublishJob(job.jobId, draft);
    });
    return NextResponse.json(
      {
        ok: true,
        queued: true,
        job,
      },
      { status: 202 },
    );
  }

  const result = await publishAdminGameDraft(draft);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
