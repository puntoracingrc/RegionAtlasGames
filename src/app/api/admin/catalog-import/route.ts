import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-auth";
import { REGION_OPTIONS } from "@/lib/admin-draft-storage";
import { listAdminPlatforms } from "@/lib/admin-entity-catalog";
import { upsertCatalogStagingFromImport } from "@/lib/catalog-staging";
import { readCatalogStagingIndex } from "@/lib/catalog-staging-storage";
import { catalogIdExistsInCatalog, getCatalogByPlatformWithOverlay } from "@/lib/catalog-runtime-overlay";
import { importSpreadsheet } from "@/lib/import-collection";
import { catalogIdFromStaging, guessPcPath } from "@/lib/pc-path-guess";
import { slugify } from "@/lib/slug";
import type { CollectionItem } from "@/lib/types";

export const maxDuration = 300;

function normalizeInitial(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .slice(0, 1)
    .toUpperCase();
}

function parseInitialFilter(value: FormDataEntryValue | null): Set<string> | null {
  const raw = String(value ?? "").trim();
  if (!raw || /^all|todo|todos|todas|\*$/i.test(raw)) return null;
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const letters = new Set<string>();

  for (const range of normalized.matchAll(/([A-Z0-9])-([A-Z0-9])/g)) {
    const start = range[1].charCodeAt(0);
    const end = range[2].charCodeAt(0);
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    for (let code = min; code <= max; code += 1) letters.add(String.fromCharCode(code));
  }

  normalized
    .replace(/([A-Z0-9])-([A-Z0-9])/g, " ")
    .split(/[\s,;]+/)
    .flatMap((chunk) => chunk.split(""))
    .forEach((entry) => {
      if (/^[A-Z0-9]$/.test(entry)) letters.add(entry);
    });

  return letters.size > 0 ? letters : null;
}

type PublishedMatch = {
  published: boolean;
  catalogId?: string;
  reason?: string;
};

function matchesInitialFilter(item: CollectionItem, filter: Set<string> | null): boolean {
  if (!filter) return true;
  const initial = normalizeInitial(item.title);
  return Boolean(initial && filter.has(initial));
}

function normalizeRegionForDuplicate(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sameImportRegion(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeRegionForDuplicate(a);
  const right = normalizeRegionForDuplicate(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes("espana") && right.includes("espana");
}

function normalizeDuplicateTitle(value: string | null | undefined): string {
  let clean = slugify(value ?? "");
  let previous = "";
  while (clean && clean !== previous) {
    previous = clean;
    clean = clean.replace(
      /-(?:pal|espana|spain|eur|europa|usa|ntsc|japan|japon|jp|ps5|ps4|ps3|ps2|ps1|switch-2|switch|xbox-one|xbox-series|xbox-series-x|xbox-classic)$/i,
      "",
    );
  }
  return clean;
}

async function publishedMatch(item: CollectionItem, region: string): Promise<PublishedMatch> {
  if (item.catalogMatched && item.catalogId) {
    return { published: true, catalogId: item.catalogId, reason: "enlazado en el archivo" };
  }
  const guess = guessPcPath({
    platformSlug: item.platformSlug,
    region,
    title: item.title,
    titlePc: item.titlePc ?? item.title,
  });
  if (!guess.slug) return { published: false };

  const catalogId = catalogIdFromStaging({ platformSlug: item.platformSlug, slug: guess.slug, region });
  if (await catalogIdExistsInCatalog(catalogId)) {
    return { published: true, catalogId, reason: "id exacto" };
  }

  const importTitleKeys = new Set(
    [item.title, item.titlePc, guess.slug]
      .map(normalizeDuplicateTitle)
      .filter(Boolean),
  );
  if (importTitleKeys.size === 0) return { published: false };

  const platformGames = await getCatalogByPlatformWithOverlay(item.platformSlug);
  const match = platformGames.find((game) => {
    if (!sameImportRegion(game.region, region)) return false;
    const gameTitleKeys = [
      game.title,
      game.titlePc,
      game.slug,
    ].map(normalizeDuplicateTitle).filter(Boolean);
    return gameTitleKeys.some((key) => importTitleKeys.has(key));
  });

  if (!match) return { published: false };
  return { published: true, catalogId: match.id, reason: "título igual" };
}

export async function POST(request: Request) {
  const admin = await assertAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const platformSlug = String(form.get("platformSlug") ?? "").trim();
  const region = String(form.get("region") ?? "").trim();
  const platformFilter = !platformSlug || platformSlug === "all" || platformSlug === "*" ? "all" : platformSlug;
  const initialFilterRaw = String(form.get("initialFilter") ?? form.get("initial") ?? "").trim();
  const initialFilter = parseInitialFilter(initialFilterRaw);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Sube un archivo CSV o Excel." }, { status: 400 });
  }
  if (!REGION_OPTIONS.includes(region as (typeof REGION_OPTIONS)[number])) {
    return NextResponse.json({ error: "Selecciona una región válida." }, { status: 400 });
  }

  const platforms = await listAdminPlatforms();
  const platformBySlug = new Map(platforms.map((entry) => [entry.slug, entry]));
  const selectedPlatform = platformFilter === "all" ? null : platformBySlug.get(platformFilter);
  if (platformFilter !== "all" && !selectedPlatform) {
    return NextResponse.json({ error: "Plataforma no encontrada." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    return NextResponse.json({ error: "Formato no soportado. Usa .csv, .xlsx o .xls." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { items, stats } = importSpreadsheet(buffer, file.name);
  const stagingIndex = await readCatalogStagingIndex();
  const stagedPcIds = new Set(stagingIndex.pcIds);
  const platformItems =
    platformFilter === "all"
      ? items.filter((item) => platformBySlug.has(item.platformSlug))
      : items.filter((item) => item.platformSlug === platformFilter);
  const initialItems = platformItems.filter((item) => matchesInitialFilter(item, initialFilter));

  const queuedItems: CollectionItem[] = [];
  const skippedPublished: Array<{ title: string; pcId: number | null; catalogId?: string; reason?: string }> = [];
  const skippedQueued: Array<{ title: string; pcId: number | null }> = [];
  const skippedNoPcId: Array<{ title: string }> = [];

  for (const item of initialItems) {
    if (item.pcImportId == null) {
      skippedNoPcId.push({ title: item.title });
      continue;
    }
    const targetPlatformSlug = platformFilter === "all" ? item.platformSlug : platformFilter;
    if (!platformBySlug.has(targetPlatformSlug)) {
      skippedNoPcId.push({ title: item.title });
      continue;
    }
    const normalized: CollectionItem = {
      ...item,
      platformSlug: targetPlatformSlug,
      region,
      inRetroCatalog: true,
      catalogMatched: false,
      catalogId: null,
      priceRegionVerified: false,
    };
    const published = await publishedMatch(normalized, region);
    if (published.published) {
      skippedPublished.push({
        title: item.title,
        pcId: item.pcImportId,
        catalogId: published.catalogId,
        reason: published.reason,
      });
      continue;
    }
    if (stagedPcIds.has(item.pcImportId)) {
      skippedQueued.push({ title: item.title, pcId: item.pcImportId });
      continue;
    }
    queuedItems.push(normalized);
  }

  const staging = await upsertCatalogStagingFromImport({
    userId: `admin-catalog-import:${admin.id}`,
    items: queuedItems,
    importedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    source: file.name,
    selected: {
      platformSlug: platformFilter,
      platformName: selectedPlatform?.name ?? "Todas las detectadas",
      region,
      initialFilter: initialFilterRaw || "Todas",
    },
    stats: {
      totalRows: stats.totalRows,
      parsedItems: items.length,
      platformMatched: platformItems.length,
      afterInitial: initialItems.length,
      queued: queuedItems.length,
      skippedPublished: skippedPublished.length,
      skippedAlreadyQueued: skippedQueued.length,
      skippedNoPcId: skippedNoPcId.length,
      discardedOtherPlatforms: items.length - platformItems.length,
      warnings: stats.warnings,
    },
    staging,
    samples: {
      queued: queuedItems.slice(0, 8).map((item) => ({ title: item.title, pcId: item.pcImportId })),
      published: skippedPublished.slice(0, 8),
      alreadyQueued: skippedQueued.slice(0, 8),
      noPcId: skippedNoPcId.slice(0, 8),
    },
  });
}
