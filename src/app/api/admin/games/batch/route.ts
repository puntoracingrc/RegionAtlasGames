import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import {
  draftFromManualInput,
  nextManualPcId,
  writeAdminGameDraft,
} from "@/lib/admin-draft-storage";
import {
  draftFromCatalogGame,
  ensureManualStagingEntry,
  getPublishedGameForAdmin,
  publishAdminGameDraft,
  updatePublishedCatalogGame,
} from "@/lib/admin-catalog-publish";
import {
  applyExpandedRegionalIdentity,
  expandRegionalVariantBatch,
  type AdminRegionalVariantBatchInput,
} from "@/lib/admin-regional-variant-batch";
import {
  catalogIdExistsInCatalog,
  triggerCatalogDeployHook,
} from "@/lib/catalog-runtime-overlay";
import { slugify } from "@/lib/slug";

export const maxDuration = 300;

type BatchBody = AdminRegionalVariantBatchInput & {
  coverUrl?: string | null;
  year?: number | string | null;
  releaseDate?: string | null;
  pegi?: number | string | null;
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
  const pegi = optionalNumber(body.pegi);
  if (body.year != null && body.year !== "" && year == null) {
    return NextResponse.json({ error: "Año no válido." }, { status: 400 });
  }
  if (body.players != null && body.players !== "" && players == null) {
    return NextResponse.json({ error: "Jugadores no válido." }, { status: 400 });
  }
  if (pegi != null && ![3, 7, 12, 16, 18].includes(pegi)) {
    return NextResponse.json({ error: "PEGI no válido." }, { status: 400 });
  }

  const drafts = [];
  const existingDrafts: Array<{ originalCatalogId: string; draft: ReturnType<typeof draftFromCatalogGame> }> = [];
  const catalogIds = new Set<string>();
  const workId = slugify(body.baseSlug?.trim() || body.title);
  for (const row of expanded.rows) {
    if (row.existingCatalogId) {
      if (!body.publishNow) {
        return NextResponse.json(
          { error: "Las fichas existentes solo pueden incorporarse al publicar el lote." },
          { status: 400 },
        );
      }
      const resolved = await getPublishedGameForAdmin(row.existingCatalogId);
      if (!resolved) {
        return NextResponse.json(
          { error: `No existe la ficha «${row.existingCatalogId}».` },
          { status: 404 },
        );
      }
      if (resolved.game.platformSlug !== body.platformSlug) {
        return NextResponse.json(
          { error: `La ficha «${row.existingCatalogId}» pertenece a otra plataforma.` },
          { status: 400 },
        );
      }
      const current = draftFromCatalogGame(resolved.game, resolved.details);
      const enteredPrices = row.initialPrices && Object.values(row.initialPrices).some((value) => value != null)
        ? row.initialPrices
        : null;
      existingDrafts.push({
        originalCatalogId: row.existingCatalogId,
        draft: {
          ...applyExpandedRegionalIdentity(current, row),
          title: body.title.trim(),
          titlePc: body.title.trim(),
          workId,
          regionalStatus: "resolved",
          physicalReleaseGroup: row.group,
          initialPrices: enteredPrices,
          physicalVariant: row.physicalVariant,
          reference: row.group.productCodes?.join(" / ") || current.reference,
          coverUrl: row.group.coverUrl ?? body.coverUrl ?? current.coverUrl,
          year: year ?? current.year,
          releaseDate: body.releaseDate?.trim() || current.releaseDate,
          pegi: pegi ?? current.pegi,
          players: players ?? current.players,
          support: body.support?.trim() || current.support,
          developerName: body.developerName?.trim() || current.developerName,
          developerSlug: body.developerSlug?.trim() || current.developerSlug,
          publisherName: body.publisherName?.trim() || current.publisherName,
          publisherSlug: body.publisherSlug?.trim() || current.publisherSlug,
          genreNames: cleanList(body.genreNames).length ? cleanList(body.genreNames) : current.genreNames,
          subgenreNames: cleanList(body.subgenreNames).length ? cleanList(body.subgenreNames) : current.subgenreNames,
          facetNames: cleanList(body.facetNames).length ? cleanList(body.facetNames) : current.facetNames,
          description: body.description?.trim() || current.description,
          updatedAt: new Date().toISOString(),
        },
      });
      continue;
    }
    const pcId = await nextManualPcId();
    const draft = draftFromManualInput({
      title: body.title,
      platformSlug: body.platformSlug,
      region: row.region,
      workId,
      regionalStatus: "resolved",
      marketRegion: row.marketRegion,
      physicalReleaseGroup: row.group,
      initialPrices: row.initialPrices,
      slug: row.slug,
      physicalVariant: row.physicalVariant,
      reference: row.group.productCodes?.join(" / ") || null,
      coverUrl: row.group.coverUrl ?? body.coverUrl ?? null,
      year,
      releaseDate: body.releaseDate ?? null,
      pegi,
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
  let publicUrl: string | null = null;
  if (body.publishNow) {
    for (const item of existingDrafts) {
      const result = await updatePublishedCatalogGame(item.originalCatalogId, item.draft, { triggerDeploy: false });
      if ("error" in result) {
        return NextResponse.json(
          {
            error: `Se guardó el lote, pero la actualización se detuvo en ${item.originalCatalogId}: ${result.error}`,
            created: drafts.map((entry) => entry.catalogId),
            published,
          },
          { status: 409 },
        );
      }
      published.push(result.catalogId);
      publicUrl ??= result.url;
    }
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
      publicUrl ??= result.url;
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
    updated: existingDrafts.map((item) => item.originalCatalogId),
    published,
    workId,
    redirect: publicUrl ?? (drafts[0] ? `/admin/cola/${drafts[0].pcId}` : "/admin/cola"),
  });
}
