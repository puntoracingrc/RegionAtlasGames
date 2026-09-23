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
  classifyRegionalBatchRowPublication,
  expandRegionalVariantBatch,
  matchesPublishedRegionalVariantRow,
  regionalVariantBatchCatalogId,
  selectRegionalVariantBatchRow,
  type AdminRegionalVariantBatchInput,
} from "@/lib/admin-regional-variant-batch";
import {
  catalogIdExistsInCatalog,
  loadCatalogOverlayIndexFresh,
  readCatalogOverlayDetailsFresh,
  readCatalogOverlayGameFresh,
  triggerCatalogDeployHook,
} from "@/lib/catalog-runtime-overlay";
import { getCatalogGame } from "@/lib/catalog";
import { buildCatalogSeoSlug } from "@/lib/catalog-url";
import { slugify } from "@/lib/slug";

export const maxDuration = 300;

type BatchBody = AdminRegionalVariantBatchInput & {
  action?: "row" | "status" | "finalize";
  rowIndex?: number;
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

async function processBatch(request: Request) {
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

  if (body.action === "finalize") {
    const deployHook = await triggerCatalogDeployHook();
    return NextResponse.json({ ok: true, deployHook });
  }

  const selection = selectRegionalVariantBatchRow(expanded.rows, body.rowIndex);
  if ("error" in selection) {
    return NextResponse.json({ error: selection.error }, { status: 400 });
  }

  const drafts = [];
  const existingDrafts: Array<{ originalCatalogId: string; draft: ReturnType<typeof draftFromCatalogGame> }> = [];
  const catalogIds = new Set<string>();
  const workId = slugify(body.baseSlug?.trim() || body.title);
  const row = selection.row;
  if (body.action === "status") {
    const catalogId = regionalVariantBatchCatalogId(body.platformSlug, row);
    const [index, overlayGame, details] = await Promise.all([
      loadCatalogOverlayIndexFresh(true),
      readCatalogOverlayGameFresh(catalogId, true),
      readCatalogOverlayDetailsFresh(catalogId, true),
    ]);
    const staticGame = getCatalogGame(catalogId) ?? null;
    const detailsReady = Boolean(details)
      && (year == null || details?.year === year)
      && (players == null || details?.players === players)
      && (pegi == null || details?.pegi === pegi)
      && (!body.releaseDate?.trim() || details?.releaseDate === body.releaseDate.trim())
      && (!body.description?.trim() || details?.description === body.description.trim())
      && (!body.developerName?.trim() || details?.developer?.name === body.developerName.trim())
      && (!body.publisherName?.trim() || details?.publisher?.name === body.publisherName.trim());
    const status = classifyRegionalBatchRowPublication({
      indexed: index.ids.includes(catalogId), overlayGame, staticGame,
      detailsReady,
      identityMatches: Boolean(overlayGame && matchesPublishedRegionalVariantRow(overlayGame, {
        title: body.title, platformSlug: body.platformSlug, workId, row,
      })),
    });
    return NextResponse.json({
      ok: true,
      status,
      catalogId,
      rowIndex: selection.rowIndex,
      redirect: status === "MATCHING" && overlayGame ? `/catalogo/${buildCatalogSeoSlug(overlayGame)}` : null,
    });
  }

  console.info("[admin-games-batch] row started", {
    rowIndex: selection.rowIndex, totalRows: expanded.rows.length, market: row.market,
    publishNow: Boolean(body.publishNow),
  });
  for (const row of [selection.row]) {
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
    // Direct publication is durable in the catalog overlay. It does not need
    // a staging record and a second draft Blob write before that publication.
    const pcId = body.publishNow ? 0 : await nextManualPcId();
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

  if (!body.publishNow) {
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
  }

  const published: string[] = [];
  let publicUrl: string | null = null;
  if (body.publishNow) {
    for (const item of existingDrafts) {
      const result = await updatePublishedCatalogGame(item.originalCatalogId, item.draft, {
        triggerDeploy: false,
        preserveCatalogId: true,
      });
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
    // The UI sends one row per request and calls finalize once after all rows.
    // Preserve the former behavior for a legacy one-row caller.
    if (body.action !== "row") await triggerCatalogDeployHook();
  }

  console.info("[admin-games-batch] row completed", {
    rowIndex: selection.rowIndex, totalRows: expanded.rows.length,
    created: drafts.map((draft) => draft.catalogId), published,
  });

  return NextResponse.json({
    ok: true,
    physicalVariantCount: expanded.physicalVariantCount,
    regionalRecordCount: expanded.rows.length,
    rowIndex: selection.rowIndex,
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

export async function POST(request: Request) {
  try {
    return await processBatch(request);
  } catch (error) {
    console.error("[admin-games-batch] request failed", error);
    return NextResponse.json({ error: "Error al procesar el lote. Comprueba el estado de la identidad antes de reintentar." }, { status: 500 });
  }
}
