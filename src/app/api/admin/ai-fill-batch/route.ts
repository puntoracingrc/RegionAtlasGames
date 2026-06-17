import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { draftFromStaging, readAdminGameDraft, writeAdminGameDraft } from "@/lib/admin-draft-storage";
import { streamAdminAiFill, type AdminAiFillOptions } from "@/lib/admin-ai-fill";
import { listCatalogStagingGames } from "@/lib/catalog-staging-storage";
import type { AdminGameDraft } from "@/lib/admin-draft-types";
import type { CatalogStagingStatus } from "@/lib/catalog-staging-types";

type BatchMode = "missing" | "force";

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

export async function POST(request: Request) {
  if (!(await assertAdminApi())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as {
    platformSlug?: string;
    region?: string;
    status?: "all" | CatalogStagingStatus;
    mode?: BatchMode;
    limit?: number;
    includeMetadata?: boolean;
    includeDescription?: boolean;
    dryRun?: boolean;
  };

  const platformSlug = body.platformSlug?.trim() || "all";
  const region = body.region?.trim() || "all";
  const status = body.status ?? "pending-catalog";
  const mode: BatchMode = body.mode === "force" ? "force" : "missing";
  const limit = normalizeLimit(body.limit);
  const options: AdminAiFillOptions = {
    onlyMissing: mode !== "force",
    includeMetadata: body.includeMetadata !== false,
    includeDescription: body.includeDescription !== false,
  };

  const allGames = await listCatalogStagingGames();
  const candidates = allGames
    .filter((game) => game.status !== "promoted")
    .filter((game) => platformSlug === "all" || game.platformSlug === platformSlug)
    .filter((game) => region === "all" || game.region === region)
    .filter((game) => status === "all" || game.status === status)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.title.localeCompare(b.title, "es"));

  const report = {
    scanned: candidates.length,
    selected: 0,
    processed: 0,
    saved: 0,
    skipped: 0,
    errors: 0,
    dryRun: body.dryRun === true,
    items: [] as Array<{
      pcId: number;
      title: string;
      status: "processed" | "skipped" | "error" | "dry-run";
      message: string;
    }>,
  };

  for (const game of candidates) {
    if (report.selected >= limit) break;
    const existing = await readAdminGameDraft(game.pcId);
    const draft = draftFromStaging(game, existing);
    const shouldProcess = mode === "force" ? true : needsMissingFill(draft);

    if (!shouldProcess) {
      report.skipped += 1;
      report.items.push({
        pcId: game.pcId,
        title: game.title,
        status: "skipped",
        message: "Ya tiene descripción, SEO y metadatos básicos.",
      });
      continue;
    }

    report.selected += 1;
    if (body.dryRun) {
      report.items.push({
        pcId: game.pcId,
        title: game.title,
        status: "dry-run",
        message: hasUsefulAiContent(draft) ? "Se completaría respetando huecos." : "Se generaría desde cero.",
      });
      continue;
    }

    try {
      let finalDraft: AdminGameDraft | null = null;
      let lastError: string | null = null;
      for await (const event of streamAdminAiFill(draft, options)) {
        if (event.type === "done") finalDraft = event.draft;
        if (event.type === "error") lastError = event.message;
      }

      if (!finalDraft || lastError) {
        report.errors += 1;
        report.items.push({
          pcId: game.pcId,
          title: game.title,
          status: "error",
          message: lastError ?? "La IA no devolvió borrador final.",
        });
        continue;
      }

      finalDraft.slug = draft.slug;
      finalDraft.catalogId = draft.catalogId;
      finalDraft.platformSlug = draft.platformSlug;
      finalDraft.region = draft.region;

      const saved = await writeAdminGameDraft(finalDraft);
      if ("error" in saved) {
        report.errors += 1;
        report.items.push({
          pcId: game.pcId,
          title: game.title,
          status: "error",
          message: saved.error,
        });
        continue;
      }

      report.processed += 1;
      report.saved += 1;
      report.items.push({
        pcId: game.pcId,
        title: game.title,
        status: "processed",
        message: "Borrador completado con IA.",
      });
    } catch (error) {
      report.errors += 1;
      report.items.push({
        pcId: game.pcId,
        title: game.title,
        status: "error",
        message: error instanceof Error ? error.message : "Error inesperado.",
      });
    }
  }

  return NextResponse.json({ ok: true, report });
}
