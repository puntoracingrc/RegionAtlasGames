import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { markStagingGamePromoted } from "./catalog-staging-enrich";
import {
  readCatalogStagingGame,
  readCatalogStagingIndex,
  rebuildPlatformStats,
  writeCatalogStagingGame,
  writeCatalogStagingIndex,
} from "./catalog-staging-storage";
import type { AdminGameDraft } from "./admin-draft-types";
import type { CatalogStagingGame } from "./catalog-staging-types";
import type { CatalogGame, GameDetails } from "./types";
import { canWriteCatalogFiles } from "./admin-auth";
import {
  catalogIdExistsInCatalog,
  deleteCatalogOverlayGame,
  loadCatalogOverlayIndex,
  readCatalogOverlayDetails,
  readCatalogOverlayGame,
  triggerCatalogDeployHook,
  writeCatalogOverlay,
} from "./catalog-runtime-overlay";
import { buildCatalogSeoSlug } from "./catalog-url";
import { getCatalogGame, listedCatalog } from "./catalog";
import { guessPcPath } from "./pc-path-guess";
import { slugify } from "./slug";
import { applyDraftPatch, draftFromCatalogGame, recomputeCatalogId } from "./admin-draft-patch";
import { applyPricePatch, priceFieldsFromGame, type AdminPriceFields } from "./admin-price-patch";
import { createAdminCompany } from "./admin-entity-catalog";
import { isInvalidGenreEntity } from "./genre-normalize";
import {
  buildCoverCatalogPath,
  downloadAndUploadCoverToCdn,
  isCoverPathUrl,
  isRemoteCoverUrl,
} from "./covers-upload";

const CATALOG_FILE = path.join(process.cwd(), "data", "catalog.json");
const DETAILS_FILE = path.join(process.cwd(), "data", "game-details.json");
const META_FILE = path.join(process.cwd(), "data", "meta.json");

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function entityDraft(
  name: string | null,
  slug: string | null,
  source: "wikidata" | "merged" = "wikidata",
) {
  if (!name?.trim()) return null;
  const s = slug?.trim() || slugify(name);
  return {
    name: name.trim(),
    slug: s,
    museumPath: null,
    pcPath: null,
    source,
  };
}

async function registerDraftCompanies(draft: AdminGameDraft): Promise<void> {
  for (const entity of [
    { name: draft.developerName, slug: draft.developerSlug },
    { name: draft.publisherName, slug: draft.publisherSlug },
  ]) {
    if (!entity.name?.trim()) continue;
    const result = await createAdminCompany({
      name: entity.name.trim(),
      slug: entity.slug?.trim() || undefined,
    });
    if ("error" in result && !result.error.includes("Ya existe")) {
      console.warn("[admin-catalog] could not register company", entity.slug ?? entity.name, result.error);
    }
  }
}

async function localizeRemoteDraftCover(draft: AdminGameDraft): Promise<AdminGameDraft | { error: string }> {
  const targetCatalogId = recomputeCatalogId(draft);
  const targetCoverUrl = buildCoverCatalogPath(draft.platformSlug, targetCatalogId);
  const shouldLocalize =
    isRemoteCoverUrl(draft.coverUrl) ||
    (isCoverPathUrl(draft.coverUrl) && draft.coverUrl !== targetCoverUrl);

  if (!shouldLocalize) {
    return draft;
  }

  const uploaded = await downloadAndUploadCoverToCdn({
    platformSlug: draft.platformSlug,
    slug: draft.slug,
    catalogId: targetCatalogId,
    sourceUrl: draft.coverUrl ?? "",
  });

  if ("error" in uploaded) {
    return { error: uploaded.error };
  }

  return {
    ...draft,
    coverUrl: uploaded.coverUrl,
  };
}

function applyLocalizedDraftCover(target: AdminGameDraft, localized: AdminGameDraft): void {
  target.coverUrl = localized.coverUrl;
}

function buildCatalogEntry(draft: AdminGameDraft, staging: CatalogStagingGame | null): CatalogGame {
  const guess = guessPcPath({
    platformSlug: draft.platformSlug,
    region: draft.region,
    title: draft.title,
    titlePc: draft.titlePc,
  });

  return {
    id: draft.catalogId,
    slug: draft.slug,
    title: draft.title,
    titlePc: draft.titlePc ?? draft.title,
    platformSlug: draft.platformSlug,
    region: draft.region,
    physicalVariant: draft.physicalVariant,
    edition: draft.edition || "standard",
    listingStatus: "listed",
    coverUrl: draft.coverUrl,
    pcId: staging?.pcId && staging.pcId > 0 ? staging.pcId : null,
    pcPath: staging?.pcPath ?? staging?.pcPathGuess ?? guess.pcPath,
    pcRegion: staging?.pcRegion ?? guess.pcRegion,
    pcCondition: null,
    matchConfidence: staging ? "STAGING_ADMIN" : "ADMIN_MANUAL",
    marketMin: staging?.marketMin ?? null,
    marketMax: staging?.marketMax ?? null,
    recommendedPrice: staging?.recommendedPrice ?? null,
    pcRefPrice: staging?.pcRefPrice ?? null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: new Date().toISOString().slice(0, 10),
    hasEsPrice: false,
  };
}

function buildDetailsEntry(draft: AdminGameDraft): GameDetails {
  const now = new Date().toISOString().slice(0, 19);
  const developer = entityDraft(draft.developerName, draft.developerSlug);
  const publisher = entityDraft(draft.publisherName, draft.publisherSlug);
  const genres = draft.genreNames
    .map((name) => entityDraft(name, slugify(name)))
    .filter((genre) => !genre || !isInvalidGenreEntity(genre))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const subgenres = (draft.subgenreNames ?? [])
    .map((name) => entityDraft(name, slugify(name), "merged"))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const facets = (draft.facetNames ?? [])
    .map((name) => entityDraft(name, slugify(name), "merged"))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return {
    year: draft.year,
    releaseDate: draft.releaseDate,
    reference: draft.reference,
    players: draft.players,
    support: draft.support,
    developer,
    publisher,
    genres,
    subgenres,
    facets,
    series: null,
    fetchedAt: now,
    mergedAt: now,
    description: draft.description,
    descriptionMeta: draft.descriptionMeta ?? undefined,
    seoMeta: draft.seoMeta,
    fieldSources: {
      developer: developer ? "wikidata" : undefined,
      publisher: publisher ? "wikidata" : undefined,
      genres: genres.length ? "wikidata" : undefined,
      subgenres: subgenres.length ? "wikidata" : undefined,
      facets: facets.length ? "wikidata" : undefined,
      year: draft.year ? "wikidata" : undefined,
      reference: draft.reference ? "serialstation" : undefined,
    },
  };
}

function mergeCatalogFromDraft(existing: CatalogGame, draft: AdminGameDraft): CatalogGame {
  const guess = guessPcPath({
    platformSlug: draft.platformSlug,
    region: draft.region,
    title: draft.title,
    titlePc: draft.titlePc,
  });

  return {
    ...existing,
    id: draft.catalogId,
    slug: draft.slug,
    title: draft.title,
    titlePc: draft.titlePc ?? draft.title,
    platformSlug: draft.platformSlug,
    region: draft.region,
    physicalVariant: draft.physicalVariant,
    edition: draft.edition || existing.edition || "standard",
    coverUrl: draft.coverUrl,
    pcPath: existing.pcPath ?? guess.pcPath,
    pcRegion: existing.pcRegion ?? guess.pcRegion,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

function mergeDetailsFromDraft(existing: GameDetails | null, draft: AdminGameDraft): GameDetails {
  const built = buildDetailsEntry(draft);
  if (!existing) return built;
  return {
    ...existing,
    year: built.year,
    releaseDate: built.releaseDate,
    reference: built.reference,
    players: built.players,
    support: built.support,
    developer: built.developer,
    publisher: built.publisher,
    genres: built.genres,
    subgenres: built.subgenres,
    facets: built.facets,
    description: built.description,
    descriptionMeta: built.descriptionMeta ?? existing.descriptionMeta,
    seoMeta: built.seoMeta ?? existing.seoMeta,
    mergedAt: built.mergedAt,
  };
}

export type AdminCatalogSearchRow = {
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
  physicalVariant: string | null;
  coverUrl: string | null;
};

export async function searchAdminCatalogGames(
  q: string,
  limit = 40,
): Promise<AdminCatalogSearchRow[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];

  const matches = (game: CatalogGame) =>
    game.title.toLowerCase().includes(needle) ||
    game.id.toLowerCase().includes(needle) ||
    game.slug.toLowerCase().includes(needle);

  const rows = new Map<string, AdminCatalogSearchRow>();

  for (const game of listedCatalog) {
    if (!matches(game)) continue;
    rows.set(game.id, {
      catalogId: game.id,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      physicalVariant: game.physicalVariant ?? null,
      coverUrl: game.coverUrl,
    });
  }

  const overlayIndex = await loadCatalogOverlayIndex();
  for (const id of overlayIndex.ids) {
    if (rows.has(id)) continue;
    const game = await readCatalogOverlayGame(id);
    if (!game || game.listingStatus === "excluded" || !matches(game)) continue;
    rows.set(id, {
      catalogId: game.id,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      physicalVariant: game.physicalVariant ?? null,
      coverUrl: game.coverUrl,
    });
  }

  return [...rows.values()]
    .sort((a, b) => a.title.localeCompare(b.title, "es"))
    .slice(0, limit);
}

export async function getPublishedGameForAdmin(
  catalogId: string,
): Promise<{ game: CatalogGame; details: GameDetails | null } | null> {
  const trimmed = catalogId.trim();
  let game = getCatalogGame(trimmed) ?? null;
  if (!game) {
    game = (await readCatalogOverlayGame(trimmed)) ?? null;
  }
  if (!game) return null;

  let details: GameDetails | null =
    loadJson<Record<string, GameDetails>>(DETAILS_FILE, {})[trimmed] ?? null;
  if (!details) {
    details = (await readCatalogOverlayDetails(trimmed)) ?? null;
  }

  return { game, details };
}

export { draftFromCatalogGame, applyDraftPatch, recomputeCatalogId };

export type UpdatePublishedResult =
  | {
      ok: true;
      catalogId: string;
      previousCatalogId: string;
      url: string;
      mode: "overlay" | "disk" | "both";
      deployHook?: { triggered: boolean; detail?: string };
    }
  | { error: string };

export async function updatePublishedCatalogGame(
  originalCatalogId: string,
  draft: AdminGameDraft,
): Promise<UpdatePublishedResult> {
  const original = originalCatalogId.trim();
  if (!original) return { error: "Falta el id de catálogo." };
  if (!draft.title?.trim()) return { error: "Falta el título." };
  if (!draft.slug?.trim()) return { error: "Falta el slug." };

  const localizedDraft = await localizeRemoteDraftCover(draft);
  if ("error" in localizedDraft) return { error: localizedDraft.error };
  applyLocalizedDraftCover(draft, localizedDraft);

  draft.catalogId = recomputeCatalogId(draft);

  const resolved = await getPublishedGameForAdmin(original);
  if (!resolved) return { error: "Juego no encontrado en el catálogo." };

  if (draft.catalogId !== original) {
    if (await catalogIdExistsInCatalog(draft.catalogId)) {
      return { error: `Ya existe otro juego con id «${draft.catalogId}».` };
    }
  }

  const entry = mergeCatalogFromDraft(resolved.game, draft);
  const details = mergeDetailsFromDraft(resolved.details, draft);
  const seoSlug = buildCatalogSeoSlug(entry);
  const url = `/catalogo/${seoSlug}`;

  if (draft.catalogId !== original) {
    await deleteCatalogOverlayGame(original);
  }

  let mode: "overlay" | "disk" | "both" = "overlay";
  const overlaySaved = await writeCatalogOverlay({ game: entry, details });
  if ("error" in overlaySaved && !canWriteCatalogFiles()) {
    return { error: overlaySaved.error };
  }

  if (canWriteCatalogFiles()) {
    const catalog = loadJson<CatalogGame[]>(CATALOG_FILE, []);
    const allDetails = loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});

    const idx = catalog.findIndex((g) => g.id === original);
    if (idx >= 0) {
      catalog[idx] = entry;
    } else {
      catalog.push(entry);
    }

    if (draft.catalogId !== original && original in allDetails) {
      delete allDetails[original];
    }
    allDetails[draft.catalogId] = details;

    saveJson(CATALOG_FILE, catalog);
    saveJson(DETAILS_FILE, allDetails);
    mode = "error" in overlaySaved ? "disk" : "both";
  }

  await registerDraftCompanies(draft);
  const deployHook = await triggerCatalogDeployHook();

  return {
    ok: true,
    catalogId: draft.catalogId,
    previousCatalogId: original,
    url,
    mode,
    deployHook,
  };
}

export async function updatePublishedCatalogPrices(
  catalogId: string,
  body: Partial<Record<string, unknown>>,
): Promise<
  | { ok: true; catalogId: string; prices: AdminPriceFields; mode: "overlay" | "disk" | "both" }
  | { error: string }
> {
  const trimmed = catalogId.trim();
  if (!trimmed) return { error: "Falta el id de catálogo." };

  const resolved = await getPublishedGameForAdmin(trimmed);
  if (!resolved) return { error: "Juego no encontrado en el catálogo." };

  const entry = applyPricePatch(resolved.game, body);
  let details = resolved.details;
  if (!details && canWriteCatalogFiles()) {
    details = loadJson<Record<string, GameDetails>>(DETAILS_FILE, {})[trimmed] ?? null;
  }
  if (!details) {
    details = (await readCatalogOverlayDetails(trimmed)) ?? null;
  }
  if (!details) {
    const now = new Date().toISOString().slice(0, 19);
    details = {
      year: null,
      releaseDate: null,
      reference: null,
      players: null,
      support: null,
      developer: null,
      publisher: null,
      genres: [],
      subgenres: [],
      facets: [],
      series: null,
      fetchedAt: now,
      mergedAt: now,
      description: null,
    };
  }

  let mode: "overlay" | "disk" | "both" = "overlay";
  const overlaySaved = await writeCatalogOverlay({ game: entry, details });
  if ("error" in overlaySaved && !canWriteCatalogFiles()) {
    return { error: overlaySaved.error };
  }

  if (canWriteCatalogFiles()) {
    const catalog = loadJson<CatalogGame[]>(CATALOG_FILE, []);
    const idx = catalog.findIndex((g) => g.id === trimmed);
    if (idx >= 0) {
      catalog[idx] = entry;
      saveJson(CATALOG_FILE, catalog);
      mode = "error" in overlaySaved ? "disk" : "both";
    } else if ("error" in overlaySaved) {
      return { error: "Juego no encontrado en catalog.json local." };
    }
  }

  return { ok: true, catalogId: trimmed, prices: priceFieldsFromGame(entry), mode };
}

export { priceFieldsFromGame };

export type PublishResult =
  | {
      ok: true;
      catalogId: string;
      url: string;
      mode: "overlay" | "disk" | "both";
      deployHook?: { triggered: boolean; detail?: string };
    }
  | { error: string };

export async function publishAdminGameDraft(
  draft: AdminGameDraft,
): Promise<PublishResult> {
  const localizedDraft = await localizeRemoteDraftCover(draft);
  if ("error" in localizedDraft) return { error: localizedDraft.error };
  applyLocalizedDraftCover(draft, localizedDraft);

  if (await catalogIdExistsInCatalog(draft.catalogId)) {
    return { error: `Ya existe un juego con id ${draft.catalogId}. Cambia el slug.` };
  }

  const staging =
    draft.pcId !== 0 ? await readCatalogStagingGame(draft.pcId) : null;

  const entry = buildCatalogEntry(draft, staging);
  const details = buildDetailsEntry(draft);
  const seoSlug = buildCatalogSeoSlug(entry);
  const url = `/catalogo/${seoSlug}`;

  let mode: "overlay" | "disk" | "both" = "overlay";

  const overlaySaved = await writeCatalogOverlay({ game: entry, details });
  if ("error" in overlaySaved && !canWriteCatalogFiles()) {
    return { error: overlaySaved.error };
  }

  if (canWriteCatalogFiles()) {
    const catalog = loadJson<CatalogGame[]>(CATALOG_FILE, []);
    catalog.push(entry);
    saveJson(CATALOG_FILE, catalog);

    const allDetails = loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});
    allDetails[draft.catalogId] = details;
    saveJson(DETAILS_FILE, allDetails);

    const meta = loadJson<{
      listedByPlatform?: Record<string, number>;
      catalogListed?: number;
    }>(META_FILE, {});
    if (meta.listedByPlatform) {
      meta.listedByPlatform[draft.platformSlug] =
        (meta.listedByPlatform[draft.platformSlug] ?? 0) + 1;
    }
    if (typeof meta.catalogListed === "number") {
      meta.catalogListed += 1;
    }
    saveJson(META_FILE, meta);
    mode = "error" in overlaySaved ? "disk" : "both";
  }

  if (staging) {
    await markStagingGamePromoted(staging.pcId, draft.catalogId);
  }

  await registerDraftCompanies(draft);
  const deployHook = await triggerCatalogDeployHook();

  return { ok: true, catalogId: draft.catalogId, url, mode, deployHook };
}

export async function ensureManualStagingEntry(
  draft: AdminGameDraft,
  meta?: {
    contributorEmail?: string | null;
    reviewStatus?: AdminGameDraft["reviewStatus"];
  },
): Promise<CatalogStagingGame> {
  const existing = await readCatalogStagingGame(draft.pcId);
  if (existing) return existing;

  const guess = guessPcPath({
    platformSlug: draft.platformSlug,
    region: draft.region,
    title: draft.title,
    titlePc: draft.titlePc,
  });

  const now = new Date().toISOString();
  const game: CatalogStagingGame = {
    pcId: draft.pcId,
    title: draft.title,
    titlePc: draft.titlePc,
    platformSlug: draft.platformSlug,
    consoleName: null,
    region: draft.region,
    inRetroCatalog: true,
    status: "pending-catalog",
    pcPath: null,
    pcPathGuess: guess.pcPath,
    pcRegion: guess.pcRegion,
    coverUrl: draft.coverUrl,
    coverSourceUrl: null,
    pcRefPrice: null,
    recommendedPrice: null,
    marketMin: null,
    marketMax: null,
    firstSeenAt: now,
    lastSeenAt: now,
    importCount: 0,
    userCount: 0,
    unitCount: 0,
    userIds: [],
    enrichedAt: null,
    enrichError: null,
    catalogId: draft.catalogId,
    promotedAt: null,
    contributorEmail: meta?.contributorEmail ?? draft.contributorEmail ?? null,
    reviewStatus: meta?.reviewStatus ?? draft.reviewStatus ?? null,
    submittedAt: draft.submittedAt ?? null,
  };

  await writeCatalogStagingGame(game);
  const index = await readCatalogStagingIndex();
  if (!index.pcIds.includes(game.pcId)) {
    index.pcIds = [...index.pcIds, game.pcId].sort((a, b) => a - b);
    const { listCatalogStagingGames } = await import("./catalog-staging-storage");
    const games = await listCatalogStagingGames();
    index.byPlatform = rebuildPlatformStats(games);
    await writeCatalogStagingIndex(index);
  }
  return game;
}

export async function triggerPostSaveEnrichment(pcId: number): Promise<void> {
  const { enrichStagingGameFromPriceCharting } = await import("./pricecharting-enrich");
  const game = await readCatalogStagingGame(pcId);
  if (!game || game.status === "promoted") return;
  const enriched = await enrichStagingGameFromPriceCharting(game);
  await writeCatalogStagingGame(enriched);
}

export type DeleteCatalogGameResult =
  | {
      ok: true;
      catalogId: string;
      removedFromOverlay: boolean;
      removedFromDisk: boolean;
    }
  | { error: string };

export async function deletePublishedCatalogGame(
  catalogId: string,
): Promise<DeleteCatalogGameResult> {
  const trimmed = catalogId.trim();
  if (!trimmed) return { error: "Falta el id de catálogo." };

  const exists = await catalogIdExistsInCatalog(trimmed);
  if (!exists) return { error: "El juego no está en el catálogo." };

  const overlayResult = await deleteCatalogOverlayGame(trimmed);
  if ("error" in overlayResult) return { error: overlayResult.error };

  let removedFromDisk = false;
  const staticGame = getCatalogGame(trimmed);

  if (canWriteCatalogFiles()) {
    const catalog = loadJson<CatalogGame[]>(CATALOG_FILE, []);
    const game = staticGame ?? catalog.find((g) => g.id === trimmed) ?? null;
    const nextCatalog = catalog.filter((g) => g.id !== trimmed);
    if (nextCatalog.length !== catalog.length) {
      saveJson(CATALOG_FILE, nextCatalog);
      removedFromDisk = true;
    }

    const allDetails = loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});
    if (trimmed in allDetails) {
      delete allDetails[trimmed];
      saveJson(DETAILS_FILE, allDetails);
      removedFromDisk = true;
    }

    if (game) {
      const meta = loadJson<{
        listedByPlatform?: Record<string, number>;
        catalogListed?: number;
        gamesWithDetails?: number;
      }>(META_FILE, {});
      if (meta.listedByPlatform?.[game.platformSlug] != null) {
        meta.listedByPlatform[game.platformSlug] = Math.max(
          0,
          meta.listedByPlatform[game.platformSlug] - 1,
        );
      }
      if (typeof meta.catalogListed === "number") {
        meta.catalogListed = Math.max(0, meta.catalogListed - 1);
      }
      if (typeof meta.gamesWithDetails === "number") {
        meta.gamesWithDetails = Math.max(0, meta.gamesWithDetails - 1);
      }
      saveJson(META_FILE, meta);
    }
  }

  await triggerCatalogDeployHook();

  return {
    ok: true,
    catalogId: trimmed,
    removedFromOverlay: overlayResult.removed,
    removedFromDisk,
  };
}

export async function deleteAdminStagingEntry(input: {
  pcId: number;
  catalogId?: string | null;
  deletePublished?: boolean;
}): Promise<
  | {
      ok: true;
      deletedStaging: boolean;
      deletedDraft: true;
      deletedCatalog?: DeleteCatalogGameResult;
    }
  | { error: string }
> {
  const staging = await readCatalogStagingGame(input.pcId);
  const catalogId = input.catalogId?.trim() || staging?.catalogId?.trim() || null;

  let deletedCatalog: DeleteCatalogGameResult | undefined;
  if (input.deletePublished !== false && catalogId) {
    const exists = await catalogIdExistsInCatalog(catalogId);
    if (exists) {
      deletedCatalog = await deletePublishedCatalogGame(catalogId);
      if ("error" in deletedCatalog) return deletedCatalog;
    }
  }

  const { deleteAdminGameDraft } = await import("./admin-draft-storage");
  const { deleteCatalogStagingGame } = await import("./catalog-staging-storage");

  if (staging) {
    const stagingDeleted = await deleteCatalogStagingGame(input.pcId);
    if ("error" in stagingDeleted) return stagingDeleted;
  }

  await deleteAdminGameDraft(input.pcId);

  return {
    ok: true,
    deletedStaging: Boolean(staging),
    deletedDraft: true,
    deletedCatalog,
  };
}
