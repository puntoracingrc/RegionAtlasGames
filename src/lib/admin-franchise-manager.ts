import path from "path";
import { blobAuthConfigured } from "./blob-auth";
import { getCatalogGame } from "./catalog";
import {
  addEntityRelationship,
  linkGameToFranchise,
  linkSeriesToFranchise,
  propagateSeriesFranchiseMembership,
  upsertFranchiseEntity,
} from "./franchise-domain";
import {
  getBaseFranchiseSystemState,
  getEntityRelationshipDisplays,
  getLegacySeriesRedirect,
  getSeriesClassification,
  resolveFranchiseIndexEntry,
  type EntityRelationshipDisplay,
  type PublicFranchiseReference,
} from "./franchise-system";
import type {
  EntityRelationship,
  FranchiseEntity,
  FranchiseReference,
  FranchiseRole,
  FranchiseSystemState,
  GameFranchiseRelation,
  RelationshipEntityRef,
} from "./franchise-types";
import {
  mutateBlobJsonDocument,
  mutateDiskJsonDocument,
  readBlobJsonDocument,
  readDiskJsonDocument,
  type JsonMutation,
} from "./json-document-store";
import {
  getPublicSeriesIndexEntry,
  listPublicSeriesForGame,
  listPublicSeriesIndexEntries,
} from "./admin-series-manager";
import type { IndexEntry } from "./types";

const OVERLAY_BLOB_PATH = "region-atlas/admin/franchise-system-overlay.json";
const OVERLAY_DISK_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "admin",
  "franchise-system-overlay.json",
);

type FranchiseOverlayDocument = {
  schemaVersion: 1;
  updatedAt: string | null;
  state: FranchiseSystemState | null;
};

type MutationResult = { ok: true } | { error: string };
type CreateMutationResult = { slug: string } | { error: string };

export type AdminFranchiseRow = FranchiseEntity & {
  catalogEntryCount: number;
  directCatalogEntryCount: number;
  seriesCount: number;
};

export type AdminFranchiseDetail = {
  franchise: AdminFranchiseRow;
  catalogEntries: Array<{
    id: string;
    title: string;
    platformSlug: string;
    region: string;
    membership: GameFranchiseRelation["membership"];
    primary: boolean;
    role: FranchiseRole | null;
  }>;
  series: Array<{
    slug: string;
    name: string;
    catalogEntryCount: number;
    primary: boolean;
  }>;
  relationships: EntityRelationshipDisplay[];
};

export type AdminSeriesFranchiseContext = {
  classification: ReturnType<typeof getSeriesClassification> | null;
  franchises: Array<{
    id: string;
    slug: string;
    name: string;
    status: FranchiseEntity["status"];
    selected: boolean;
    primary: boolean;
  }>;
  relationships: EntityRelationshipDisplay[];
};

export type AdminGameFranchiseContext = {
  franchises: Array<{
    id: string;
    slug: string;
    name: string;
    status: FranchiseEntity["status"];
    selected: boolean;
    primary: boolean;
    membership: GameFranchiseRelation["membership"] | null;
    role: FranchiseRole | null;
  }>;
  series: Array<{ slug: string; name: string; catalogEntryCount: number }>;
  seriesOptions: Array<{ slug: string; name: string; catalogEntryCount: number }>;
  relationships: EntityRelationshipDisplay[];
};

function emptyDocument(): FranchiseOverlayDocument {
  return { schemaVersion: 1, updatedAt: null, state: null };
}

function cloneState(state: FranchiseSystemState): FranchiseSystemState {
  return {
    franchises: Object.fromEntries(
      Object.values(state.franchises).map((franchise) => [franchise.slug, { ...franchise }]),
    ),
    seriesFranchiseRelations: state.seriesFranchiseRelations.map((relation) => ({ ...relation })),
    gameFranchiseRelations: state.gameFranchiseRelations.map((relation) => ({
      ...relation,
      inheritedFromSeriesSlugs: [...relation.inheritedFromSeriesSlugs],
    })),
    entityRelationships: state.entityRelationships.map((relationship) => ({ ...relationship })),
  };
}

function parseDocument(raw: string): FranchiseOverlayDocument {
  const parsed = JSON.parse(raw) as Partial<FranchiseOverlayDocument> | null;
  if (
    !parsed ||
    parsed.schemaVersion !== 1 ||
    (parsed.state !== null && parsed.state !== undefined && typeof parsed.state !== "object")
  ) {
    throw new Error("Documento de franquicias no válido.");
  }
  return {
    schemaVersion: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    state: parsed.state ? cloneState(parsed.state) : null,
  };
}

function shouldUseBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) || blobAuthConfigured();
}

function blobOptions() {
  return {
    pathname: OVERLAY_BLOB_PATH,
    empty: emptyDocument,
    parse: parseDocument,
    maximumSizeInBytes: 32 * 1024 * 1024,
    cacheControlMaxAge: 60,
  };
}

function diskOptions() {
  return {
    pathname: OVERLAY_DISK_PATH,
    empty: emptyDocument,
    parse: parseDocument,
  };
}

async function readDocument(): Promise<FranchiseOverlayDocument> {
  return shouldUseBlobStorage()
    ? readBlobJsonDocument(blobOptions())
    : readDiskJsonDocument(diskOptions());
}

async function reconcileSeriesMemberships(
  input: FranchiseSystemState,
): Promise<FranchiseSystemState> {
  const state = cloneState(input);
  const validSeriesFranchiseKeys = new Set(
    state.seriesFranchiseRelations.map((relation) => `${relation.seriesSlug}\0${relation.franchiseId}`),
  );
  let gameFranchiseRelations = state.gameFranchiseRelations.flatMap((relation) => {
    const inheritedFromSeriesSlugs = relation.inheritedFromSeriesSlugs.filter((seriesSlug) =>
      validSeriesFranchiseKeys.has(`${seriesSlug}\0${relation.franchiseId}`));
    const direct = relation.membership === "direct" || relation.membership === "direct_and_inherited";
    if (!direct && inheritedFromSeriesSlugs.length === 0) return [];
    return [{
      ...relation,
      inheritedFromSeriesSlugs,
      membership: direct
        ? inheritedFromSeriesSlugs.length > 0 ? "direct_and_inherited" as const : "direct" as const
        : "inherited" as const,
    }];
  });

  const seriesSlugs = [...new Set(state.seriesFranchiseRelations.map((relation) => relation.seriesSlug))];
  for (const seriesSlug of seriesSlugs) {
    const series = await getPublicSeriesIndexEntry(seriesSlug);
    if (!series) continue;
    const reviewedAt = state.seriesFranchiseRelations
      .filter((relation) => relation.seriesSlug === seriesSlug)
      .map((relation) => relation.reviewedAt)
      .sort()
      .at(-1) ?? "1970-01-01";
    gameFranchiseRelations = propagateSeriesFranchiseMembership({
      seriesSlug,
      gameIds: series.gameIds,
      seriesRelations: state.seriesFranchiseRelations,
      gameRelations: gameFranchiseRelations,
      reviewedAt,
    });
  }
  return { ...state, gameFranchiseRelations };
}

async function readState(): Promise<FranchiseSystemState> {
  return reconcileSeriesMemberships((await readDocument()).state ?? getBaseFranchiseSystemState());
}

async function mutateState<R>(
  mutation: (current: FranchiseSystemState) => Promise<{ state: FranchiseSystemState; result: R }> |
    { state: FranchiseSystemState; result: R },
): Promise<R> {
  const wrapped: JsonMutation<FranchiseOverlayDocument, R> = async (document) => {
    const current = await reconcileSeriesMemberships(document.state ?? getBaseFranchiseSystemState());
    const outcome = await mutation(current);
    return {
      next: {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        state: cloneState(outcome.state),
      },
      result: outcome.result,
    };
  };
  return shouldUseBlobStorage()
    ? mutateBlobJsonDocument(blobOptions(), wrapped)
    : mutateDiskJsonDocument(diskOptions(), wrapped);
}

function franchiseById(state: FranchiseSystemState, id: string): FranchiseEntity | undefined {
  return Object.values(state.franchises).find((franchise) => franchise.id === id);
}

function toAdminRow(state: FranchiseSystemState, franchise: FranchiseEntity): AdminFranchiseRow {
  const gameRelations = state.gameFranchiseRelations.filter((relation) => relation.franchiseId === franchise.id);
  return {
    ...franchise,
    catalogEntryCount: new Set(gameRelations.map((relation) => relation.gameId)).size,
    directCatalogEntryCount: new Set(
      gameRelations
        .filter((relation) => relation.membership === "direct" || relation.membership === "direct_and_inherited")
        .map((relation) => relation.gameId),
    ).size,
    seriesCount: state.seriesFranchiseRelations.filter((relation) => relation.franchiseId === franchise.id).length,
  };
}

export async function listPublicFranchiseIndexEntries(): Promise<IndexEntry[]> {
  const state = await readState();
  return Object.values(state.franchises)
    .filter((franchise) => franchise.status === "published")
    .map((franchise) => resolveFranchiseIndexEntry(franchise, state.gameFranchiseRelations))
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es", { numeric: true }));
}

export async function getPublicFranchiseEntity(slug: string): Promise<FranchiseEntity | null> {
  const franchise = (await readState()).franchises[slug];
  return franchise?.status === "published" ? franchise : null;
}

export async function getPublicFranchiseIndexEntry(slug: string): Promise<IndexEntry | null> {
  const state = await readState();
  const franchise = state.franchises[slug];
  return franchise?.status === "published"
    ? resolveFranchiseIndexEntry(franchise, state.gameFranchiseRelations)
    : null;
}

export async function listPublicFranchisesForCatalogEntries(
  catalogIds: string[],
): Promise<PublicFranchiseReference[]> {
  const selected = new Set(catalogIds.map((id) => id.trim()).filter(Boolean));
  if (selected.size === 0) return [];
  return (await listPublicFranchiseIndexEntries())
    .map((entry) => {
      const matchedCatalogIds = entry.gameIds.filter((id) => selected.has(id));
      return {
        slug: entry.slug,
        name: entry.name,
        catalogEntryCount: entry.gameCount,
        matchedCatalogEntryCount: matchedCatalogIds.length,
        matchedCatalogIds,
      };
    })
    .filter((entry) => entry.matchedCatalogEntryCount > 0)
    .sort((a, b) =>
      b.matchedCatalogEntryCount - a.matchedCatalogEntryCount || a.name.localeCompare(b.name, "es"));
}

export async function getPublicFranchisesForCatalogEntry(catalogId: string): Promise<FranchiseReference[]> {
  const state = await readState();
  return state.gameFranchiseRelations
    .filter((relation) => relation.gameId === catalogId)
    .map((relation) => {
      const franchise = franchiseById(state, relation.franchiseId);
      return franchise?.status === "published"
        ? {
            id: franchise.id,
            slug: franchise.slug,
            name: franchise.name,
            primary: relation.primary,
            role: relation.role,
            membership: relation.membership,
          }
        : null;
    })
    .filter((reference): reference is FranchiseReference => Boolean(reference))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "es"));
}

export async function getPublicFranchiseRelationships(
  ref: RelationshipEntityRef,
): Promise<EntityRelationshipDisplay[]> {
  const state = await readState();
  const relationships = getEntityRelationshipDisplays(ref, {
    relationships: state.entityRelationships,
    franchises: state.franchises,
  });
  const publicSeriesSlugs = new Set((await listPublicSeriesIndexEntries()).map((series) => series.slug));
  return relationships.filter(
    (relationship) => relationship.entityType !== "series" || publicSeriesSlugs.has(relationship.entityId),
  );
}

export async function getPublicSeriesFranchises(seriesSlug: string): Promise<Array<FranchiseEntity & { primary: boolean }>> {
  const state = await readState();
  return state.seriesFranchiseRelations
    .filter((relation) => relation.seriesSlug === seriesSlug)
    .map((relation) => {
      const franchise = franchiseById(state, relation.franchiseId);
      return franchise?.status === "published" ? { ...franchise, primary: relation.primary } : null;
    })
    .filter((franchise): franchise is FranchiseEntity & { primary: boolean } => Boolean(franchise))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "es"));
}

export async function getPublicFranchiseSeries(franchiseSlug: string): Promise<Array<IndexEntry & { primary: boolean }>> {
  const state = await readState();
  const franchise = state.franchises[franchiseSlug];
  if (!franchise || franchise.status !== "published") return [];
  const relations = state.seriesFranchiseRelations.filter((relation) => relation.franchiseId === franchise.id);
  const series = await Promise.all(
    relations.map(async (relation) => {
      const entry = await getPublicSeriesIndexEntry(relation.seriesSlug);
      return entry ? { ...entry, primary: relation.primary } : null;
    }),
  );
  return series
    .filter((entry): entry is IndexEntry & { primary: boolean } => Boolean(entry))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "es"));
}

export async function listAdminFranchises(input?: { q?: string }): Promise<AdminFranchiseRow[]> {
  const state = await readState();
  const q = input?.q?.trim().toLocaleLowerCase("es") ?? "";
  return Object.values(state.franchises)
    .map((franchise) => toAdminRow(state, franchise))
    .filter((franchise) => !q || franchise.name.toLocaleLowerCase("es").includes(q) || franchise.slug.includes(q))
    .sort((a, b) =>
      b.catalogEntryCount - a.catalogEntryCount || a.name.localeCompare(b.name, "es", { numeric: true }));
}

export async function getAdminFranchise(slug: string): Promise<AdminFranchiseDetail | { error: string }> {
  const state = await readState();
  const franchise = state.franchises[slug];
  if (!franchise) return { error: "Franquicia no encontrada." };
  const row = toAdminRow(state, franchise);
  const seriesRelations = state.seriesFranchiseRelations.filter((relation) => relation.franchiseId === franchise.id);
  const series = await Promise.all(
    seriesRelations.map(async (relation) => {
      const entry = await getPublicSeriesIndexEntry(relation.seriesSlug);
      return {
        slug: relation.seriesSlug,
        name: entry?.name ?? relation.seriesSlug,
        catalogEntryCount: entry?.gameCount ?? 0,
        primary: relation.primary,
      };
    }),
  );
  const catalogEntries = state.gameFranchiseRelations
    .filter((relation) => relation.franchiseId === franchise.id)
    .map((relation) => {
      const game = getCatalogGame(relation.gameId);
      return game
        ? {
            id: game.id,
            title: game.title,
            platformSlug: game.platformSlug,
            region: game.region,
            membership: relation.membership,
            primary: relation.primary,
            role: relation.role,
          }
        : null;
    })
    .filter((game): game is NonNullable<typeof game> => Boolean(game))
    .sort((a, b) => a.title.localeCompare(b.title, "es", { numeric: true }));
  return {
    franchise: row,
    catalogEntries,
    series: series.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "es")),
    relationships: getEntityRelationshipDisplays(
      { type: "franchise", id: franchise.id },
      { relationships: state.entityRelationships, franchises: state.franchises },
    ),
  };
}

export async function getAdminSeriesFranchiseContext(
  seriesSlug: string,
): Promise<AdminSeriesFranchiseContext | { error: string }> {
  if (!(await getPublicSeriesIndexEntry(seriesSlug))) return { error: "Saga no encontrada." };
  const state = await readState();
  const selected = new Map(
    state.seriesFranchiseRelations
      .filter((relation) => relation.seriesSlug === seriesSlug)
      .map((relation) => [relation.franchiseId, relation]),
  );
  return {
    classification: getSeriesClassification(seriesSlug) ?? null,
    franchises: Object.values(state.franchises)
      .map((franchise) => ({
        id: franchise.id,
        slug: franchise.slug,
        name: franchise.name,
        status: franchise.status,
        selected: selected.has(franchise.id),
        primary: selected.get(franchise.id)?.primary ?? false,
      }))
      .sort((a, b) => Number(b.selected) - Number(a.selected) || a.name.localeCompare(b.name, "es")),
    relationships: getEntityRelationshipDisplays(
      { type: "series", id: seriesSlug },
      { relationships: state.entityRelationships, franchises: state.franchises },
    ),
  };
}

export async function getAdminGameFranchiseContext(
  gameId: string,
): Promise<AdminGameFranchiseContext | { error: string }> {
  if (!getCatalogGame(gameId)) return { error: "Ficha de catálogo no encontrada." };
  const state = await readState();
  const memberships = new Map(
    state.gameFranchiseRelations
      .filter((relation) => relation.gameId === gameId)
      .map((relation) => [relation.franchiseId, relation]),
  );
  const series = (await listPublicSeriesForGame(gameId))
    .filter((entry) => !getLegacySeriesRedirect(entry.slug))
    .map((entry) => ({ slug: entry.slug, name: entry.name, catalogEntryCount: entry.gameCount }));
  return {
    franchises: Object.values(state.franchises)
      .map((franchise) => {
        const membership = memberships.get(franchise.id);
        return {
          id: franchise.id,
          slug: franchise.slug,
          name: franchise.name,
          status: franchise.status,
          selected: Boolean(membership),
          primary: membership?.primary ?? false,
          membership: membership?.membership ?? null,
          role: membership?.role ?? null,
        };
      })
      .sort((a, b) => Number(b.selected) - Number(a.selected) || a.name.localeCompare(b.name, "es")),
    series,
    seriesOptions: await listAdminSeriesOptions(),
    relationships: getEntityRelationshipDisplays(
      { type: "game", id: gameId },
      { relationships: state.entityRelationships, franchises: state.franchises },
    ),
  };
}

export async function createAdminFranchise(input: {
  name: string;
  slug?: string;
  description?: string | null;
}): Promise<AdminFranchiseDetail | { error: string }> {
  const slug = input.slug?.trim();
  const result = await mutateState<CreateMutationResult>((state) => {
    const upserted = upsertFranchiseEntity(state.franchises, {
      name: input.name,
      slug,
      description: input.description,
      status: "draft",
      source: "admin-manual",
      confidence: "high",
      reviewedAt: new Date().toISOString(),
    });
    if (!upserted.ok) return { state, result: { error: upserted.error } as const };
    return {
      state: { ...state, franchises: upserted.value },
      result: { slug: Object.keys(upserted.value).find((key) => !state.franchises[key]) ?? slug ?? "" },
    };
  });
  if ("error" in result) return result;
  return getAdminFranchise(result.slug);
}

export async function updateAdminFranchise(
  slug: string,
  input: Partial<Pick<FranchiseEntity, "name" | "description" | "status" | "backgroundImageUrl" | "backgroundImageOpacity" | "backgroundReadability">>,
): Promise<AdminFranchiseDetail | { error: string }> {
  const result = await mutateState<MutationResult>((state) => {
    const current = state.franchises[slug];
    if (!current) return { state, result: { error: "Franquicia no encontrada." } as const };
    const upserted = upsertFranchiseEntity(state.franchises, {
      ...current,
      name: input.name ?? current.name,
      description: input.description === undefined ? current.description : input.description,
      status: input.status ?? current.status,
      backgroundImageUrl: input.backgroundImageUrl === undefined ? current.backgroundImageUrl : input.backgroundImageUrl,
      backgroundImageOpacity: input.backgroundImageOpacity === undefined
        ? current.backgroundImageOpacity
        : input.backgroundImageOpacity,
      backgroundReadability: input.backgroundReadability === undefined
        ? current.backgroundReadability
        : input.backgroundReadability,
      source: "admin-manual",
      reviewedAt: new Date().toISOString(),
    });
    if (!upserted.ok) return { state, result: { error: upserted.error } as const };
    return { state: { ...state, franchises: upserted.value }, result: { ok: true } as const };
  });
  if ("error" in result) return result;
  return getAdminFranchise(slug);
}

export async function setAdminSeriesFranchise(input: {
  seriesSlug: string;
  franchiseSlug: string;
  primary: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const series = await getPublicSeriesIndexEntry(input.seriesSlug);
  if (!series) return { error: "Saga no encontrada." };
  return mutateState<MutationResult>((state) => {
    const franchise = state.franchises[input.franchiseSlug];
    if (!franchise) return { state, result: { error: "Franquicia no encontrada." } };
    const existing = state.seriesFranchiseRelations.find(
      (relation) => relation.seriesSlug === input.seriesSlug && relation.franchiseId === franchise.id,
    );
    let seriesRelations = state.seriesFranchiseRelations;
    if (existing) {
      seriesRelations = seriesRelations.map((relation) => {
        if (relation.seriesSlug !== input.seriesSlug) return relation;
        if (relation.franchiseId === franchise.id) {
          return { ...relation, primary: input.primary, reviewedAt: new Date().toISOString() };
        }
        return input.primary ? { ...relation, primary: false } : relation;
      });
    } else {
      const linked = linkSeriesToFranchise(seriesRelations, {
        seriesSlug: input.seriesSlug,
        franchiseId: franchise.id,
        franchiseSlug: franchise.slug,
        primary: input.primary,
        source: "admin-manual",
        confidence: "high",
        reviewedAt: new Date().toISOString(),
      });
      if (!linked.ok) return { state, result: { error: linked.error } };
      seriesRelations = linked.value;
    }
    const gameRelations = propagateSeriesFranchiseMembership({
      seriesSlug: input.seriesSlug,
      gameIds: series.gameIds,
      seriesRelations,
      gameRelations: state.gameFranchiseRelations,
      reviewedAt: new Date().toISOString(),
    });
    return {
      state: { ...state, seriesFranchiseRelations: seriesRelations, gameFranchiseRelations: gameRelations },
      result: { ok: true } as const,
    };
  });
}

export async function removeAdminSeriesFranchise(input: {
  seriesSlug: string;
  franchiseSlug: string;
}): Promise<{ ok: true } | { error: string }> {
  return mutateState<MutationResult>((state) => {
    const franchise = state.franchises[input.franchiseSlug];
    if (!franchise) return { state, result: { error: "Franquicia no encontrada." } };
    const target = state.seriesFranchiseRelations.find(
      (relation) => relation.seriesSlug === input.seriesSlug && relation.franchiseId === franchise.id,
    );
    if (!target) return { state, result: { error: "La relación no existe." } };
    const siblings = state.seriesFranchiseRelations.filter(
      (relation) => relation.seriesSlug === input.seriesSlug && relation.franchiseId !== franchise.id,
    );
    if (target.primary && siblings.length > 0) {
      return { state, result: { error: "Marca otra franquicia como principal antes de retirar ésta." } };
    }
    const seriesFranchiseRelations = state.seriesFranchiseRelations.filter((relation) => relation !== target);
    const gameFranchiseRelations = state.gameFranchiseRelations.flatMap((relation) => {
      if (relation.franchiseId !== franchise.id || !relation.inheritedFromSeriesSlugs.includes(input.seriesSlug)) {
        return [relation];
      }
      const inheritedFromSeriesSlugs = relation.inheritedFromSeriesSlugs.filter((slug) => slug !== input.seriesSlug);
      const direct = relation.membership === "direct" || relation.membership === "direct_and_inherited";
      if (!direct && inheritedFromSeriesSlugs.length === 0) return [];
      return [{
        ...relation,
        inheritedFromSeriesSlugs,
        membership: direct
          ? inheritedFromSeriesSlugs.length > 0 ? "direct_and_inherited" as const : "direct" as const
          : "inherited" as const,
      }];
    });
    return {
      state: { ...state, seriesFranchiseRelations, gameFranchiseRelations },
      result: { ok: true } as const,
    };
  });
}

export async function addAdminGameFranchise(input: {
  gameId: string;
  franchiseSlug: string;
  primary?: boolean;
  role?: FranchiseRole | null;
}): Promise<{ ok: true } | { error: string }> {
  if (!getCatalogGame(input.gameId)) return { error: "Ficha de catálogo no encontrada." };
  return mutateState<MutationResult>((state) => {
    const franchise = state.franchises[input.franchiseSlug];
    if (!franchise) return { state, result: { error: "Franquicia no encontrada." } };
    const existing = state.gameFranchiseRelations.find(
      (relation) => relation.gameId === input.gameId && relation.franchiseId === franchise.id,
    );
    if (existing) {
      if (existing.membership === "direct" || existing.membership === "direct_and_inherited") {
        return { state, result: { error: "El juego ya pertenece directamente a esa franquicia." } };
      }
      const gameFranchiseRelations = state.gameFranchiseRelations.map((relation) => {
        if (relation === existing) {
          return {
            ...relation,
            membership: "direct_and_inherited" as const,
            primary: input.primary ?? relation.primary,
            role: input.role ?? relation.role,
          };
        }
        return input.primary && relation.gameId === input.gameId
          ? { ...relation, primary: false }
          : relation;
      });
      return { state: { ...state, gameFranchiseRelations }, result: { ok: true } as const };
    }
    const linked = linkGameToFranchise(state.gameFranchiseRelations, {
      gameId: input.gameId,
      franchiseId: franchise.id,
      franchiseSlug: franchise.slug,
      primary: input.primary ?? false,
      membership: "direct",
      inheritedFromSeriesSlugs: [],
      source: "admin-manual",
      reviewedAt: new Date().toISOString(),
      role: input.role ?? null,
    });
    if (!linked.ok) return { state, result: { error: linked.error } };
    return { state: { ...state, gameFranchiseRelations: linked.value }, result: { ok: true } as const };
  });
}

export async function removeAdminGameFranchise(input: {
  gameId: string;
  franchiseSlug: string;
}): Promise<{ ok: true } | { error: string }> {
  return mutateState<MutationResult>((state) => {
    const franchise = state.franchises[input.franchiseSlug];
    if (!franchise) return { state, result: { error: "Franquicia no encontrada." } };
    const existing = state.gameFranchiseRelations.find(
      (relation) => relation.gameId === input.gameId && relation.franchiseId === franchise.id,
    );
    if (!existing) return { state, result: { error: "La pertenencia no existe." } };
    if (existing.membership === "inherited") {
      return { state, result: { error: "La pertenencia está heredada de una saga; resuelve primero esa relación." } };
    }
    const gameFranchiseRelations = existing.membership === "direct_and_inherited"
      ? state.gameFranchiseRelations.map((relation) => relation === existing
          ? { ...relation, membership: "inherited" as const }
          : relation)
      : state.gameFranchiseRelations.filter((relation) => relation !== existing);
    return { state: { ...state, gameFranchiseRelations }, result: { ok: true } as const };
  });
}

export async function updateAdminGameFranchise(input: {
  gameId: string;
  franchiseSlug: string;
  primary: boolean;
  role: FranchiseRole | null;
}): Promise<MutationResult> {
  return mutateState<MutationResult>((state) => {
    const franchise = state.franchises[input.franchiseSlug];
    if (!franchise) return { state, result: { error: "Franquicia no encontrada." } };
    const existing = state.gameFranchiseRelations.find(
      (relation) => relation.gameId === input.gameId && relation.franchiseId === franchise.id,
    );
    if (!existing) return { state, result: { error: "La pertenencia no existe." } };
    const gameFranchiseRelations = state.gameFranchiseRelations.map((relation) => {
      if (relation.gameId !== input.gameId) return relation;
      if (relation.franchiseId === franchise.id) {
        return { ...relation, primary: input.primary, role: input.role, reviewedAt: new Date().toISOString() };
      }
      return input.primary ? { ...relation, primary: false } : relation;
    });
    return { state: { ...state, gameFranchiseRelations }, result: { ok: true } };
  });
}

async function relationshipEntityExists(ref: RelationshipEntityRef): Promise<boolean> {
  if (ref.type === "game") return Boolean(getCatalogGame(ref.id));
  if (ref.type === "series") return Boolean(await getPublicSeriesIndexEntry(ref.id));
  return Boolean(franchiseById(await readState(), ref.id));
}

export async function addAdminEntityRelationship(
  input: Omit<EntityRelationship, "id" | "source" | "confidence" | "reviewedAt">,
): Promise<{ ok: true } | { error: string }> {
  if (!(await relationshipEntityExists({ type: input.sourceType, id: input.sourceId }))) {
    return { error: "La entidad de origen no existe." };
  }
  if (!(await relationshipEntityExists({ type: input.targetType, id: input.targetId }))) {
    return { error: "La entidad de destino no existe." };
  }
  return mutateState<MutationResult>((state) => {
    const added = addEntityRelationship(state.entityRelationships, {
      ...input,
      source: "admin-manual",
      confidence: "high",
      reviewedAt: new Date().toISOString(),
    });
    if (!added.ok) return { state, result: { error: added.error } };
    return { state: { ...state, entityRelationships: added.value }, result: { ok: true } as const };
  });
}

export async function removeAdminEntityRelationship(id: string): Promise<{ ok: true } | { error: string }> {
  return mutateState<MutationResult>((state) => {
    if (!state.entityRelationships.some((relationship) => relationship.id === id)) {
      return { state, result: { error: "La relación no existe." } };
    }
    return {
      state: {
        ...state,
        entityRelationships: state.entityRelationships.filter((relationship) => relationship.id !== id),
      },
      result: { ok: true } as const,
    };
  });
}

export async function listAdminSeriesOptions(): Promise<Array<{
  slug: string;
  name: string;
  catalogEntryCount: number;
}>> {
  return (await listPublicSeriesIndexEntries())
    .filter((entry) => !getLegacySeriesRedirect(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      catalogEntryCount: entry.gameCount,
    }));
}

export async function resetAdminFranchiseOverlay(): Promise<{ ok: true }> {
  const mutation: JsonMutation<FranchiseOverlayDocument, { ok: true }> = () => ({
    next: emptyDocument(),
    result: { ok: true },
  });
  return shouldUseBlobStorage()
    ? mutateBlobJsonDocument(blobOptions(), mutation)
    : mutateDiskJsonDocument(diskOptions(), mutation);
}
