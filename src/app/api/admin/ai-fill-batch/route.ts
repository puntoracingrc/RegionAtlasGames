import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { draftFromStaging, readAdminGameDraft, writeAdminGameDraft } from "@/lib/admin-draft-storage";
import { streamAdminAiFill, type AdminAiFillOptions } from "@/lib/admin-ai-fill";
import { draftFromCatalogGame, updatePublishedCatalogGame } from "@/lib/admin-catalog-publish";
import { listedCatalog } from "@/lib/catalog";
import { getGameDetails } from "@/lib/indexes";
import { listCatalogStagingGames, readCatalogStagingGame } from "@/lib/catalog-staging-storage";
import type { AdminGameDraft } from "@/lib/admin-draft-types";
import type { CatalogStagingStatus } from "@/lib/catalog-staging-types";

type BatchMode = "missing" | "force";
type BatchSource = "staging" | "catalog";
type BatchItemStatus = "processed" | "skipped" | "error" | "dry-run";

type BatchItem = {
  pcId: number | null;
  catalogId?: string;
  title: string;
  platformSlug: string;
  region: string;
  status: BatchItemStatus;
  message: string;
  fieldsUpdated: string[];
  sources: string[];
  urls: string[];
  steamTags: string[];
  descriptionPreview: string | null;
  seoPreview: string | null;
};

type SearchItem = {
  id: string;
  pcId: number | null;
  catalogId?: string;
  title: string;
  platformSlug: string;
  region: string;
  status: CatalogStagingStatus | "published";
  lastSeenAt: string;
};

type BatchSummary = {
  candidates: number;
  needsFill: number;
  complete: number;
  limit: number;
  selectable: number;
};


type BatchCandidate = {
  id: string;
  source: BatchSource;
  pcId: number | null;
  catalogId?: string;
  title: string;
  platformSlug: string;
  region: string;
  status: CatalogStagingStatus | "published";
  lastSeenAt: string;
};

function normalizeBatchSource(value: string | null | undefined): BatchSource {
  return value === "catalog" ? "catalog" : "staging";
}

function catalogCandidates(): BatchCandidate[] {
  return listedCatalog
    .filter((game) => game.listingStatus !== "excluded")
    .map((game): BatchCandidate => ({
      id: `catalog:${game.id}`,
      source: "catalog",
      pcId: game.pcId ?? null,
      catalogId: game.id,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      status: "published",
      lastSeenAt: game.updatedAt ?? "",
    }));
}

async function stagingCandidates(): Promise<BatchCandidate[]> {
  const games = await listCatalogStagingGames();
  return games
    .filter((game) => game.status !== "promoted")
    .map((game): BatchCandidate => ({
      id: `staging:${game.pcId}`,
      source: "staging",
      pcId: game.pcId,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      status: game.status,
      lastSeenAt: game.lastSeenAt,
    }));
}

async function resolveCandidateDraft(candidate: BatchCandidate): Promise<AdminGameDraft | null> {
  if (candidate.source === "catalog") {
    const game = listedCatalog.find((entry) => entry.id === candidate.catalogId);
    if (!game) return null;
    return draftFromCatalogGame(game, getGameDetails(game.id) ?? null);
  }
  if (!candidate.pcId) return null;
  const staging = await readCatalogStagingGame(candidate.pcId);
  if (!staging) return null;
  const existing = await readAdminGameDraft(staging.pcId);
  return draftFromStaging(staging, existing);
}

function hasUsefulAiContent(draft: AdminGameDraft): boolean {
  return Boolean(
    draft.description &&
      draft.seoMeta?.seoDescription &&
      (draft.developerName || draft.publisherName || draft.genreNames.length > 0 || draft.year),
  );
}

function needsMissingFill(draft: AdminGameDraft): boolean {
  return !(
    draft.description &&
    draft.seoMeta?.seoDescription &&
    draft.developerName &&
    draft.publisherName &&
    draft.genreNames.length > 0
  );
}

function normalizeLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "10"), 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(50, parsed));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractUrlsFromLog(message: string): string[] {
  const matches = message.match(/https?:\/\/[^\s·]+/g) ?? [];
  return matches.map((url) => url.replace(/[),.;]+$/, ""));
}

function extractSourceFromLog(message: string): string | null {
  if (message.includes("Steam")) return "Steam";
  if (message.includes("PlayStation")) return "PlayStation";
  if (message.includes("Nintendo")) return "Nintendo";
  if (message.includes("Xbox") || message.includes("Microsoft")) return "Xbox/Microsoft";
  if (message.includes("Wikipedia")) return "Wikipedia";
  if (message.includes("Wikidata")) return "Wikidata";
  if (message.includes("fuente externa clara") || message.includes("metadatos ya existentes")) return "Datos existentes";
  if (message.includes("fuentes fiables") || message.includes("Fuente fiable")) return "Fuentes fiables";
  return null;
}

function extractSteamTagsFromLog(message: string): string[] {
  const prefix = "Etiquetas Steam detectadas:";
  const index = message.indexOf(prefix);
  if (index < 0) return [];
  return message
    .slice(index + prefix.length)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export async function GET(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestMode = searchParams.get("mode") ?? "search";
  const source = normalizeBatchSource(searchParams.get("source"));
  const platformSlug = searchParams.get("platformSlug")?.trim() || "all";
  const region = searchParams.get("region")?.trim() || "all";
  const status = searchParams.get("status")?.trim() || "all";
  const limit = normalizeLimit(searchParams.get("limit") ?? 20);

  const allCandidates = source === "catalog" ? catalogCandidates() : await stagingCandidates();
  const filteredCandidates = allCandidates
    .filter((game) => platformSlug === "all" || game.platformSlug === platformSlug)
    .filter((game) => region === "all" || game.region === region)
    .filter((game) => source === "catalog" || status === "all" || game.status === status)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.title.localeCompare(b.title, "es"));

  if (requestMode === "summary") {
    const batchMode: BatchMode = searchParams.get("batchMode") === "force" ? "force" : "missing";
    let needsFill = 0;
    for (const candidate of filteredCandidates) {
      const draft = await resolveCandidateDraft(candidate);
      if (draft && (batchMode === "force" || needsMissingFill(draft))) needsFill += 1;
    }

    const summary: BatchSummary = {
      candidates: filteredCandidates.length,
      needsFill,
      complete: Math.max(0, filteredCandidates.length - needsFill),
      limit,
      selectable: Math.min(limit, needsFill),
    };
    return NextResponse.json({ ok: true, summary });
  }

  const query = searchParams.get("q") ?? "";
  const normalizedQuery = normalizeSearch(query);
  const parsedPcId = Number.parseInt(query.trim(), 10);
  const hasNumericQuery = Number.isFinite(parsedPcId) && parsedPcId > 0;

  if (normalizedQuery.length < 2 && !hasNumericQuery) {
    return NextResponse.json({ ok: true, games: [] as SearchItem[] });
  }

  const games = filteredCandidates
    .filter((game) => {
      if (hasNumericQuery && game.pcId === parsedPcId) return true;
      const haystack = normalizeSearch(`${game.title} ${game.catalogId ?? ""} ${game.pcId ?? ""}`);
      return haystack.includes(normalizedQuery);
    })
    .slice(0, limit)
    .map((game): SearchItem => ({
      id: game.id,
      pcId: game.pcId,
      catalogId: game.catalogId,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      status: game.status,
      lastSeenAt: game.lastSeenAt,
    }));

  return NextResponse.json({ ok: true, games });
}

async function runAiForDraft(
  draft: AdminGameDraft,
  options: AdminAiFillOptions,
): Promise<{
  finalDraft: AdminGameDraft | null;
  lastError: string | null;
  fieldsUpdated: string[];
  sources: string[];
  urls: string[];
  steamTags: string[];
}> {
  let finalDraft: AdminGameDraft | null = null;
  let lastError: string | null = null;
  const fieldsUpdated: string[] = [];
  const sources: string[] = [];
  const urls: string[] = [];
  const steamTags: string[] = [];

  for await (const event of streamAdminAiFill(draft, options)) {
    if (event.type === "done") finalDraft = event.draft;
    if (event.type === "error") lastError = event.message;
    if (event.type === "field") fieldsUpdated.push(String(event.field));
    if (event.type === "log") {
      const source = extractSourceFromLog(event.message);
      if (source) sources.push(source);
      urls.push(...extractUrlsFromLog(event.message));
      steamTags.push(...extractSteamTagsFromLog(event.message));
    }
  }

  return {
    finalDraft,
    lastError,
    fieldsUpdated: uniqueStrings(fieldsUpdated),
    sources: uniqueStrings(sources),
    urls: uniqueStrings(urls),
    steamTags: uniqueStrings(steamTags),
  };
}

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as {
    source?: BatchSource;
    platformSlug?: string;
    region?: string;
    status?: "all" | CatalogStagingStatus;
    mode?: BatchMode;
    limit?: number;
    includeMetadata?: boolean;
    includeDescription?: boolean;
    dryRun?: boolean;
    pcIds?: number[];
    itemIds?: string[];
  };

  const source = normalizeBatchSource(body.source);
  const platformSlug = body.platformSlug?.trim() || "all";
  const region = body.region?.trim() || "all";
  const status = body.status ?? "pending-catalog";
  const mode: BatchMode = body.mode === "force" ? "force" : "missing";
  const limit = normalizeLimit(body.limit);
  const requestedItemIds = Array.isArray(body.itemIds) ? new Set(body.itemIds.map(String)) : null;
  const requestedPcIds = Array.isArray(body.pcIds)
    ? new Set(
        body.pcIds
          .map((pcId) => Number.parseInt(String(pcId), 10))
          .filter((pcId) => Number.isFinite(pcId) && pcId > 0),
      )
    : null;
  const options: AdminAiFillOptions = {
    onlyMissing: mode !== "force",
    includeMetadata: body.includeMetadata !== false,
    includeDescription: body.includeDescription !== false,
  };

  const allCandidates = source === "catalog" ? catalogCandidates() : await stagingCandidates();
  const candidates = allCandidates
    .filter((game) => !requestedItemIds || requestedItemIds.has(game.id))
    .filter((game) => !requestedPcIds || (game.pcId != null && requestedPcIds.has(game.pcId)))
    .filter((game) => platformSlug === "all" || game.platformSlug === platformSlug)
    .filter((game) => region === "all" || game.region === region)
    .filter((game) => source === "catalog" || status === "all" || game.status === status)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.title.localeCompare(b.title, "es"));

  const report = {
    scanned: candidates.length,
    selected: 0,
    processed: 0,
    saved: 0,
    skipped: 0,
    errors: 0,
    dryRun: body.dryRun === true,
    source,
    sourceCoverage: {
      steam: 0,
      official: 0,
      wikipedia: 0,
      existing: 0,
      other: 0,
    },
    fieldCoverage: {} as Record<string, number>,
    items: [] as BatchItem[],
  };

  for (const candidate of candidates) {
    if (report.selected >= limit) break;
    const draft = await resolveCandidateDraft(candidate);
    if (!draft) {
      report.errors += 1;
      report.items.push({
        pcId: candidate.pcId,
        catalogId: candidate.catalogId,
        title: candidate.title,
        platformSlug: candidate.platformSlug,
        region: candidate.region,
        status: "error",
        message: "No se pudo cargar la ficha para IA.",
        fieldsUpdated: [],
        sources: [],
        urls: [],
        steamTags: [],
        descriptionPreview: null,
        seoPreview: null,
      });
      continue;
    }

    const shouldProcess = mode === "force" ? true : needsMissingFill(draft);

    if (!shouldProcess) {
      report.skipped += 1;
      report.items.push({
        pcId: candidate.pcId,
        catalogId: candidate.catalogId,
        title: candidate.title,
        platformSlug: candidate.platformSlug,
        region: candidate.region,
        status: "skipped",
        message: source === "catalog" ? "La ficha publicada ya parece completa." : "Ya tiene descripción, SEO y metadatos básicos.",
        fieldsUpdated: [],
        sources: [],
        urls: [],
        steamTags: [],
        descriptionPreview: draft.description,
        seoPreview: draft.seoMeta?.seoDescription ?? null,
      });
      continue;
    }

    report.selected += 1;

    try {
      const aiResult = await runAiForDraft(draft, options);
      const { finalDraft, lastError } = aiResult;

      if (!finalDraft || lastError) {
        report.errors += 1;
        report.items.push({
          pcId: candidate.pcId,
          catalogId: candidate.catalogId,
          title: candidate.title,
          platformSlug: candidate.platformSlug,
          region: candidate.region,
          status: "error",
          message: lastError ?? "La IA no devolvió borrador final.",
          fieldsUpdated: aiResult.fieldsUpdated,
          sources: aiResult.sources,
          urls: aiResult.urls,
          steamTags: aiResult.steamTags,
          descriptionPreview: finalDraft?.description ?? draft.description,
          seoPreview: finalDraft?.seoMeta?.seoDescription ?? draft.seoMeta?.seoDescription ?? null,
        });
        continue;
      }

      report.processed += 1;
      for (const field of aiResult.fieldsUpdated) {
        report.fieldCoverage[field] = (report.fieldCoverage[field] ?? 0) + 1;
      }
      if (aiResult.sources.some((entry) => entry.toLowerCase().includes("steam"))) report.sourceCoverage.steam += 1;
      if (aiResult.sources.some((entry) => /playstation|nintendo|xbox|microsoft|fuentes fiables/i.test(entry))) {
        report.sourceCoverage.official += 1;
      }
      if (aiResult.sources.some((entry) => /wikipedia|wikidata/i.test(entry))) report.sourceCoverage.wikipedia += 1;
      if (aiResult.sources.some((entry) => /datos existentes/i.test(entry))) report.sourceCoverage.existing += 1;
      if (aiResult.sources.length === 0) report.sourceCoverage.other += 1;

      finalDraft.slug = draft.slug;
      finalDraft.catalogId = draft.catalogId;
      finalDraft.platformSlug = draft.platformSlug;
      finalDraft.region = draft.region;

      if (body.dryRun) {
        report.items.push({
          pcId: candidate.pcId,
          catalogId: candidate.catalogId,
          title: candidate.title,
          platformSlug: candidate.platformSlug,
          region: candidate.region,
          status: "dry-run",
          message: hasUsefulAiContent(finalDraft)
            ? "Previsualización generada; no se ha guardado."
            : "Previsualización parcial; revisa antes de guardar.",
          fieldsUpdated: aiResult.fieldsUpdated,
          sources: aiResult.sources,
          urls: aiResult.urls,
          steamTags: aiResult.steamTags,
          descriptionPreview: finalDraft.description,
          seoPreview: finalDraft.seoMeta?.seoDescription ?? null,
        });
        continue;
      }

      const saved = source === "catalog"
        ? await updatePublishedCatalogGame(draft.catalogId, finalDraft)
        : await writeAdminGameDraft(finalDraft);
      if ("error" in saved) {
        report.errors += 1;
        report.items.push({
          pcId: candidate.pcId,
          catalogId: candidate.catalogId,
          title: candidate.title,
          platformSlug: candidate.platformSlug,
          region: candidate.region,
          status: "error",
          message: saved.error,
          fieldsUpdated: aiResult.fieldsUpdated,
          sources: aiResult.sources,
          urls: aiResult.urls,
          steamTags: aiResult.steamTags,
          descriptionPreview: finalDraft.description,
          seoPreview: finalDraft.seoMeta?.seoDescription ?? null,
        });
        continue;
      }

      report.saved += 1;
      report.items.push({
        pcId: candidate.pcId,
        catalogId: candidate.catalogId,
        title: candidate.title,
        platformSlug: candidate.platformSlug,
        region: candidate.region,
        status: "processed",
        message: source === "catalog" ? "Ficha publicada actualizada con IA." : "Borrador completado con IA.",
        fieldsUpdated: aiResult.fieldsUpdated,
        sources: aiResult.sources,
        urls: aiResult.urls,
        steamTags: aiResult.steamTags,
        descriptionPreview: finalDraft.description,
        seoPreview: finalDraft.seoMeta?.seoDescription ?? null,
      });
    } catch (error) {
      report.errors += 1;
      report.items.push({
        pcId: candidate.pcId,
        catalogId: candidate.catalogId,
        title: candidate.title,
        platformSlug: candidate.platformSlug,
        region: candidate.region,
        status: "error",
        message: error instanceof Error ? error.message : "Error inesperado.",
        fieldsUpdated: [],
        sources: [],
        urls: [],
        steamTags: [],
        descriptionPreview: draft.description,
        seoPreview: draft.seoMeta?.seoDescription ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true, report });
}
