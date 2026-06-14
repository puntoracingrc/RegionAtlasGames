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
  triggerCatalogDeployHook,
  writeCatalogOverlay,
} from "./catalog-runtime-overlay";
import { buildCatalogSeoSlug } from "./catalog-url";
import { guessPcPath } from "./pc-path-guess";
import { slugify } from "./slug";

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

function entityDraft(name: string | null, slug: string | null) {
  if (!name?.trim()) return null;
  const s = slug?.trim() || slugify(name);
  return {
    name: name.trim(),
    slug: s,
    museumPath: null,
    pcPath: null,
    source: "wikidata" as const,
  };
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
      year: draft.year ? "wikidata" : undefined,
      reference: draft.reference ? "serialstation" : undefined,
    },
  };
}

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

  const deployHook = await triggerCatalogDeployHook();

  return { ok: true, catalogId: draft.catalogId, url, mode, deployHook };
}

export async function ensureManualStagingEntry(
  draft: AdminGameDraft,
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
