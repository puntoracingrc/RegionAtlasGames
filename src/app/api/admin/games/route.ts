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
import {
  gameReleaseGenreNames,
  gameReleasePublisher,
  type GameReleaseDiscoveryCandidate,
} from "@/lib/game-release-discovery";
import type { AdminGameEsSource } from "@/lib/admin-draft-types";
import {
  readGameReleaseDiscoveryResult,
  recordGameReleaseDiscoveryReview,
} from "@/lib/local-game-runner-jobs";

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
    physicalVariant?: string | null;
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
    autoEnrich?: boolean;
    autoAi?: boolean;
    confirmDistinct?: boolean;
    discoveryJobId?: string;
    discoverySourceSku?: string;
  };

  let discoveryContext: { jobId: string; sourceSku: string } | null = null;
  let gameEsSource: AdminGameEsSource | null = null;
  let gameEsPegi: GameReleaseDiscoveryCandidate["pegi"] = null;
  if (body.discoveryJobId || body.discoverySourceSku) {
    const jobId = body.discoveryJobId?.trim() ?? "";
    const sourceSku = body.discoverySourceSku?.trim() ?? "";
    if (!jobId || !sourceSku) {
      return NextResponse.json({ error: "Falta identificar el candidato GAME." }, { status: 400 });
    }
    const discovery = await readGameReleaseDiscoveryResult(jobId);
    if ("error" in discovery) {
      return NextResponse.json({ error: discovery.error }, { status: 400 });
    }
    if (discovery.job.catalogDiscoveryReviews?.[sourceSku]) {
      return NextResponse.json({ error: "Este candidato GAME ya fue revisado." }, { status: 409 });
    }
    const candidate = discovery.result.candidates.find((item) => item.sourceSku === sourceSku);
    if (!candidate) {
      return NextResponse.json({ error: "El candidato GAME no pertenece a este resultado." }, { status: 400 });
    }
    body.title = candidate.title;
    body.platformSlug = candidate.platformSlug;
    body.region = candidate.region;
    body.coverUrl = candidate.imageUrl;
    body.releaseDate = candidate.releaseDate;
    body.year = candidate.year;
    const publisher = gameReleasePublisher(candidate.publisher);
    body.publisherName = publisher?.name ?? null;
    body.publisherSlug = publisher?.slug ?? null;
    body.genreNames = gameReleaseGenreNames(candidate.genres);
    body.support = candidate.platformSlug === "ps5" ? "Disco Blu-ray" : "Cartucho";
    gameEsPegi = candidate.pegi;
    gameEsSource = {
      sku: candidate.sourceSku,
      productUrl: candidate.productUrl,
      imageUrl: candidate.imageUrl,
      fetchedAt: discovery.result.collectedAt || new Date().toISOString(),
    };
    discoveryContext = { jobId, sourceSku };
  }

  const title = body.title?.trim();
  const platformSlug = body.platformSlug?.trim();
  const region = body.region?.trim();

  if (!title) return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  if (!platformSlug) return NextResponse.json({ error: "Falta la plataforma." }, { status: 400 });
  if (!region || !REGION_OPTIONS.includes(region as (typeof REGION_OPTIONS)[number])) {
    return NextResponse.json({ error: "Región no válida." }, { status: 400 });
  }
  const year =
    body.year == null || body.year === ""
      ? null
      : Number.parseInt(String(body.year), 10);
  const players =
    body.players == null || body.players === ""
      ? null
      : Number.parseInt(String(body.players), 10);
  if (year != null && (!Number.isFinite(year) || year < 1950 || year > 2100)) {
    return NextResponse.json({ error: "Año no válido." }, { status: 400 });
  }
  if (players != null && (!Number.isFinite(players) || players < 1 || players > 999)) {
    return NextResponse.json({ error: "Jugadores no válido." }, { status: 400 });
  }

  const cleanList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];

  const pcId = await nextManualPcId();
  const draft = draftFromManualInput({
    title,
    platformSlug,
    region,
    slug: body.slug,
    reference: body.reference ?? null,
    physicalVariant: body.physicalVariant ?? null,
    coverUrl: body.coverUrl ?? null,
    year,
    releaseDate: body.releaseDate ?? null,
    pegi: gameEsPegi,
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
    gameEsSource,
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

  let discoveryTrackingWarning: string | null = null;
  if (discoveryContext) {
    const tracked = await recordGameReleaseDiscoveryReview({
      jobId: discoveryContext.jobId,
      sourceSku: discoveryContext.sourceSku,
      status: "draft_created",
      pcId,
      catalogId: draft.catalogId,
    });
    if ("error" in tracked) discoveryTrackingWarning = tracked.error;
  }

  return NextResponse.json({
    ok: true,
    pcId,
    draft,
    redirect: `/admin/cola/${pcId}${body.autoAi ? "?ai=1" : ""}`,
    discoveryTrackingWarning,
  });
}
