import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { ensureAppDataDir, appDataDir } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { readCatalogStagingIndex } from "./catalog-staging-storage";
import type { AdminGameDraft } from "./admin-draft-types";
import type { CatalogStagingGame } from "./catalog-staging-types";
import { catalogIdFromStaging, guessPcPath } from "./pc-path-guess";
import { slugify } from "./slug";
import { getGameDetails } from "./indexes";
import { getPlatform, platforms } from "./catalog";

const ADMIN_DRAFT_BLOB_PREFIX = "region-atlas/admin/drafts";

function useBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function draftsRootDir(): string {
  ensureAppDataDir();
  return path.join(appDataDir(), "admin", "drafts");
}

function draftDiskPath(pcId: number): string {
  return path.join(draftsRootDir(), `${pcId}.json`);
}

function draftBlobPath(pcId: number): string {
  return `${ADMIN_DRAFT_BLOB_PREFIX}/${pcId}.json`;
}

function parseDraft(raw: string, pcId: number): AdminGameDraft | null {
  try {
    const parsed = JSON.parse(raw) as AdminGameDraft;
    if (!parsed || parsed.pcId !== pcId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readAdminGameDraft(pcId: number): Promise<AdminGameDraft | null> {
  if (useBlobStorage()) {
    try {
      const auth = await blobAuthOptions("private");
      const result = await get(draftBlobPath(pcId), auth);
      if (result?.statusCode === 200 && result.stream) {
        const text = await new Response(result.stream).text();
        const draft = parseDraft(text, pcId);
        if (draft) return draft;
      }
    } catch {
      /* fall through to disk */
    }
  }
  try {
    return parseDraft(readFileSync(draftDiskPath(pcId), "utf-8"), pcId);
  } catch {
    return null;
  }
}

function writeDraftToDisk(payload: AdminGameDraft): { ok: true } | { error: string } {
  try {
    const dir = draftsRootDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(draftDiskPath(payload.pcId), JSON.stringify(payload, null, 2), "utf-8");
    return { ok: true };
  } catch (error) {
    console.warn("[admin-draft] disk write failed", error);
    return { error: "No se pudo guardar el borrador en disco." };
  }
}

async function writeDraftToBlob(payload: AdminGameDraft): Promise<{ ok: true } | { error: string }> {
  try {
    const auth = await blobAuthOptions("private");
    await put(draftBlobPath(payload.pcId), JSON.stringify(payload, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { ok: true };
  } catch (error) {
    console.error("[admin-draft] blob write failed", error);
    return { error: "No se pudo guardar el borrador en Blob." };
  }
}

export async function writeAdminGameDraft(
  draft: AdminGameDraft,
): Promise<{ ok: true } | { error: string }> {
  const payload: AdminGameDraft = { ...draft, updatedAt: new Date().toISOString() };
  const diskResult = writeDraftToDisk(payload);

  if (useBlobStorage()) {
    const blobResult = await writeDraftToBlob(payload);
    if ("ok" in blobResult) return { ok: true };
    if ("error" in diskResult) return blobResult;
    console.warn("[admin-draft] blob write failed; kept on disk");
    return { ok: true };
  }

  if ("error" in diskResult) return diskResult;
  return { ok: true };
}

function entityFromName(name: string | null | undefined): { name: string; slug: string } | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return { name: trimmed, slug: slugify(trimmed) };
}

export function draftFromStaging(
  game: CatalogStagingGame,
  existing: AdminGameDraft | null,
): AdminGameDraft {
  const guess = guessPcPath({
    platformSlug: game.platformSlug,
    region: game.region,
    title: game.title,
    titlePc: game.titlePc,
  });
  const slug = existing?.slug || guess.slug;
  const catalogId =
    existing?.catalogId ||
    game.catalogId ||
    catalogIdFromStaging({ platformSlug: game.platformSlug, slug, region: game.region });

  const details = getGameDetails(catalogId);

  return {
    pcId: game.pcId,
    catalogId,
    slug,
    title: existing?.title ?? game.title,
    titlePc: existing?.titlePc ?? game.titlePc,
    platformSlug: existing?.platformSlug ?? game.platformSlug,
    region: existing?.region ?? game.region,
    edition: existing?.edition ?? "standard",
    reference: existing?.reference ?? details?.reference ?? null,
    coverUrl: existing?.coverUrl ?? game.coverUrl,
    year: existing?.year ?? details?.year ?? null,
    releaseDate: existing?.releaseDate ?? details?.releaseDate ?? null,
    players: existing?.players ?? details?.players ?? null,
    support: existing?.support ?? details?.support ?? null,
    developerName:
      existing?.developerName ?? details?.developer?.name ?? null,
    developerSlug:
      existing?.developerSlug ?? details?.developer?.slug ?? null,
    publisherName:
      existing?.publisherName ?? details?.publisher?.name ?? null,
    publisherSlug:
      existing?.publisherSlug ?? details?.publisher?.slug ?? null,
    genreNames:
      existing?.genreNames ??
      (details?.genres?.map((g) => g.name).filter(Boolean) as string[]) ??
      [],
    description: existing?.description ?? details?.description ?? null,
    seoMeta: existing?.seoMeta ?? details?.seoMeta ?? null,
    descriptionMeta: existing?.descriptionMeta ?? details?.descriptionMeta ?? null,
    source: game.pcId < 0 ? "manual" : "import",
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
  };
}

export function draftFromManualInput(input: {
  title: string;
  platformSlug: string;
  region: string;
  slug?: string;
  reference?: string | null;
  pcId: number;
}): AdminGameDraft {
  const platform = getPlatform(input.platformSlug);
  if (!platform) {
    throw new Error("Plataforma no válida.");
  }
  const slug = input.slug?.trim() || slugify(input.title);
  const catalogId = catalogIdFromStaging({
    platformSlug: input.platformSlug,
    slug,
    region: input.region,
  });

  return {
    pcId: input.pcId,
    catalogId,
    slug,
    title: input.title.trim(),
    titlePc: input.title.trim(),
    platformSlug: input.platformSlug,
    region: input.region,
    edition: "standard",
    reference: input.reference?.trim() || null,
    coverUrl: null,
    year: null,
    releaseDate: null,
    players: null,
    support: null,
    developerName: null,
    developerSlug: null,
    publisherName: null,
    publisherSlug: null,
    genreNames: [],
    description: null,
    seoMeta: null,
    descriptionMeta: null,
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}

let manualPcIdCounter: number | null = null;

export async function nextManualPcId(): Promise<number> {
  if (manualPcIdCounter != null) {
    manualPcIdCounter -= 1;
    return manualPcIdCounter;
  }

  let minId = -1;
  const index = await readCatalogStagingIndex();
  for (const id of index.pcIds) {
    if (id < minId) minId = id;
  }

  const dir = draftsRootDir();
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const id = Number.parseInt(file.replace(".json", ""), 10);
      if (Number.isFinite(id) && id < minId) minId = id;
    }
  }

  manualPcIdCounter = minId - 1;
  return manualPcIdCounter;
}

export function platformOptions() {
  return [...platforms].sort((a, b) => a.sortOrder - b.sortOrder);
}

export const REGION_OPTIONS = ["PAL España", "USA", "Japón"] as const;
