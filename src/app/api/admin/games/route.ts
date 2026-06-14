import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromManualInput,
  nextManualPcId,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import {
  ensureManualStagingEntry,
  triggerPostSaveEnrichment,
} from "@/lib/admin-catalog-publish";
import { REGION_OPTIONS } from "@/lib/admin-draft-storage";

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    platformSlug?: string;
    region?: string;
    slug?: string;
    reference?: string;
    autoEnrich?: boolean;
    autoAi?: boolean;
  };

  const title = body.title?.trim();
  const platformSlug = body.platformSlug?.trim();
  const region = body.region?.trim();

  if (!title) return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  if (!platformSlug) return NextResponse.json({ error: "Falta la plataforma." }, { status: 400 });
  if (!region || !REGION_OPTIONS.includes(region as (typeof REGION_OPTIONS)[number])) {
    return NextResponse.json({ error: "Región no válida." }, { status: 400 });
  }

  const pcId = nextManualPcId();
  const draft = draftFromManualInput({
    title,
    platformSlug,
    region,
    slug: body.slug,
    reference: body.reference ?? null,
    pcId,
  });

  await ensureManualStagingEntry(draft);
  const saved = await writeAdminGameDraft(draft);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  if (body.autoEnrich !== false) {
    triggerPostSaveEnrichment(pcId).catch(console.error);
  }

  return NextResponse.json({
    ok: true,
    pcId,
    draft,
    redirect: `/admin/cola/${pcId}${body.autoAi ? "?ai=1" : ""}`,
  });
}
