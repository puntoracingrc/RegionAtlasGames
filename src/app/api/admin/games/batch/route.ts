import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromManualInput,
  nextManualPcId,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import {
  ensureManualStagingEntry,
  publishAdminGameDraft,
} from "@/lib/admin-catalog-publish";
import {
  expandRegionalVariantBatch,
  type AdminRegionalVariantBatchInput,
} from "@/lib/admin-regional-variant-batch";
import {
  catalogIdExistsInCatalog,
  triggerCatalogDeployHook,
} from "@/lib/catalog-runtime-overlay";

export const maxDuration = 300;

type BatchBody = AdminRegionalVariantBatchInput & {
  coverUrl?: string | null;
  year?: number | string | null;
  releaseDate?: string | null;
  players?: number | string | null;
  support?: string | null;
  developerName?: string | null;
  developerSlug?: string | null;
  publisherName?: string | null;
  publisherSlug?: string | null;
  genreNames?: string[];
  subgenreNames?: string[];
  facetNames?: string[];
  description?: string | null;
  publishNow?: boolean;
};

function optionalNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await request.json() as BatchBody;
  const expanded = expandRegionalVariantBatch(body);
  if ("error" in expanded) {
    return NextResponse.json({ error: expanded.error }, { status: 400 });
  }

  const year = optionalNumber(body.year);
  const players = optionalNumber(body.players);
  if (body.year != null && body.year !== "" && year == null) {
    return NextResponse.json({ error: "Año no válido." }, { status: 400 });
  }
  if (body.players != null && body.players !== "" && players == null) {
    return NextResponse.json({ error: "Jugadores no válido." }, { status: 400 });
  }

  const drafts = [];
  const catalogIds = new Set<string>();
  for (const row of expanded.rows) {
    const pcId = await nextManualPcId();
    const draft = draftFromManualInput({
      title: body.title,
      platformSlug: body.platformSlug,
      region: row.region,
      marketRegion: row.marketRegion,
      physicalReleaseGroup: row.group,
      slug: row.slug,
      physicalVariant: body.physicalVariant ?? null,
      reference: row.group.productCodes?.join(" / ") || null,
      coverUrl: body.coverUrl ?? null,
      year,
      releaseDate: body.releaseDate ?? null,
      players,
      support: body.support ?? null,
      developerName: body.developerName ?? null,
      developerSlug: body.developerSlug ?? null,
      publisherName: body.publisherName ?? null,
      publisherSlug: body.publisherSlug ?? null,
      genreNames: cleanList(body.genreNames),
      subgenreNames: cleanList(body.subgenreNames),
      facetNames: cleanList(body.facetNames),
      description: body.description ?? null,
      pcId,
    });
    if (catalogIds.has(draft.catalogId) || await catalogIdExistsInCatalog(draft.catalogId)) {
      return NextResponse.json(
        { error: `Ya existe «${draft.catalogId}» o se repite dentro del lote.` },
        { status: 409 },
      );
    }
    catalogIds.add(draft.catalogId);
    drafts.push(draft);
  }

  for (const draft of drafts) {
    await ensureManualStagingEntry(draft);
    const saved = await writeAdminGameDraft(draft);
    if ("error" in saved) {
      return NextResponse.json(
        { error: `El lote quedó incompleto al guardar ${draft.catalogId}: ${saved.error}` },
        { status: 500 },
      );
    }
  }

  const published: string[] = [];
  if (body.publishNow) {
    for (const draft of drafts) {
      const result = await publishAdminGameDraft(draft, { triggerDeploy: false });
      if ("error" in result) {
        return NextResponse.json(
          {
            error: `Se guardó el lote, pero la publicación se detuvo en ${draft.catalogId}: ${result.error}`,
            created: drafts.map((item) => item.catalogId),
            published,
          },
          { status: 409 },
        );
      }
      published.push(result.catalogId);
    }
    await triggerCatalogDeployHook();
  }

  return NextResponse.json({
    ok: true,
    physicalVariantCount: expanded.physicalVariantCount,
    regionalRecordCount: drafts.length,
    created: drafts.map((draft) => ({
      pcId: draft.pcId,
      catalogId: draft.catalogId,
      region: draft.region,
      marketRegion: draft.marketRegion,
      groupId: draft.physicalReleaseGroup?.id,
    })),
    published,
    redirect: drafts[0] ? `/admin/cola/${drafts[0].pcId}` : "/admin/cola",
  });
}
