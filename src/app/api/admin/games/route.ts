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
import { catalogIdExistsInCatalog } from "@/lib/catalog-runtime-overlay";
import { findSimilarCatalogGames } from "@/lib/admin-title-similarity";
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
    confirmDistinct?: boolean;
  };

  const title = body.title?.trim();
  const platformSlug = body.platformSlug?.trim();
  const region = body.region?.trim();

  if (!title) return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  if (!platformSlug) return NextResponse.json({ error: "Falta la plataforma." }, { status: 400 });
  if (!region || !REGION_OPTIONS.includes(region as (typeof REGION_OPTIONS)[number])) {
    return NextResponse.json({ error: "Región no válida." }, { status: 400 });
  }

  const pcId = await nextManualPcId();
  const draft = draftFromManualInput({
    title,
    platformSlug,
    region,
    slug: body.slug,
    reference: body.reference ?? null,
    pcId,
  });

  if (await catalogIdExistsInCatalog(draft.catalogId)) {
    return NextResponse.json(
      {
        error: `Ya existe «${draft.catalogId}» en el catálogo. Prueba otro slug o edita la ficha existente.`,
      },
      { status: 409 },
    );
  }

  if (!body.confirmDistinct) {
    const similar = findSimilarCatalogGames({
      title,
      platformSlug,
      region,
      slug: body.slug,
      excludeCatalogId: draft.catalogId,
    });
    if (similar.length > 0) {
      return NextResponse.json(
        {
          error: "similar_games",
          message:
            "Revisa los juegos parecidos antes de crear la ficha. Puede ser la misma saga o un duplicado que ya tenías.",
          matches: similar,
        },
        { status: 409 },
      );
    }
  }

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
