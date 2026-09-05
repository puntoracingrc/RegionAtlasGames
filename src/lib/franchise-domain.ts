import { slugify } from "./slug";
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type EntityRelationship,
  type FranchiseConfidence,
  type FranchiseEntity,
  type FranchiseRole,
  type GameFranchiseRelation,
  type RelationshipEntityRef,
  type RelationshipType,
  type SeriesFranchiseRelation,
} from "./franchise-types";

type DomainResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type FranchiseInput = {
  id?: string;
  slug?: string;
  name: string;
  status?: "draft" | "published";
  legacySeriesSlug?: string | null;
  description?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number | null;
  backgroundReadability?: "soft" | "normal" | "strong" | null;
  source: string;
  confidence?: FranchiseConfidence;
  reviewedAt: string;
};

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function upsertFranchiseEntity(
  current: Record<string, FranchiseEntity>,
  input: FranchiseInput,
): DomainResult<Record<string, FranchiseEntity>> {
  const name = normalizeText(input.name);
  const slug = slugify(input.slug || name);
  if (!name) return { ok: false, error: "Falta el nombre de la franquicia." };
  if (!slug) return { ok: false, error: "Slug de franquicia no válido." };

  const existing = current[slug];
  if (input.id && existing && existing.id !== input.id) {
    return { ok: false, error: "El ID existente de la franquicia no puede cambiar." };
  }
  if (input.id && !existing) {
    const byId = Object.values(current).find((franchise) => franchise.id === input.id);
    if (byId && byId.slug !== slug) {
      return { ok: false, error: "El slug existente de la franquicia no puede cambiar." };
    }
  }

  const id = existing?.id ?? input.id ?? `franchise:${slug}`;
  if (Object.values(current).some((franchise) => franchise.id === id && franchise.slug !== slug)) {
    return { ok: false, error: "Ya existe otra franquicia con ese ID." };
  }

  const opacity = input.backgroundImageOpacity;
  if (opacity !== null && opacity !== undefined && (!Number.isFinite(opacity) || opacity < 1 || opacity > 100)) {
    return { ok: false, error: "La opacidad debe estar entre 1 y 100." };
  }

  return {
    ok: true,
    value: {
      ...current,
      [slug]: {
        id,
        slug,
        name,
        status: input.status ?? existing?.status ?? "draft",
        legacySeriesSlug: normalizeOptionalText(input.legacySeriesSlug ?? existing?.legacySeriesSlug),
        description: normalizeOptionalText(input.description ?? existing?.description),
        backgroundImageUrl: normalizeOptionalText(input.backgroundImageUrl ?? existing?.backgroundImageUrl),
        backgroundImageOpacity: opacity ?? existing?.backgroundImageOpacity ?? null,
        backgroundReadability: input.backgroundReadability ?? existing?.backgroundReadability ?? null,
        source: normalizeText(input.source),
        confidence: input.confidence ?? existing?.confidence ?? "medium",
        reviewedAt: input.reviewedAt,
      },
    },
  };
}

export function publishFranchiseEntity(
  current: Record<string, FranchiseEntity>,
  slug: string,
  reviewedAt: string,
): DomainResult<Record<string, FranchiseEntity>> {
  const existing = current[slug];
  if (!existing) return { ok: false, error: "Franquicia no encontrada." };
  return {
    ok: true,
    value: { ...current, [slug]: { ...existing, status: "published", reviewedAt } },
  };
}

export function linkSeriesToFranchise(
  current: SeriesFranchiseRelation[],
  input: SeriesFranchiseRelation,
): DomainResult<SeriesFranchiseRelation[]> {
  if (!input.seriesSlug.trim() || !input.franchiseId.trim() || !input.franchiseSlug.trim()) {
    return { ok: false, error: "La saga y la franquicia son obligatorias." };
  }
  const duplicate = current.some((relation) =>
    relation.seriesSlug === input.seriesSlug && relation.franchiseId === input.franchiseId);
  if (duplicate) return { ok: false, error: "La saga ya está vinculada a esa franquicia." };

  const next = current.map((relation) =>
    input.primary && relation.seriesSlug === input.seriesSlug
      ? { ...relation, primary: false }
      : relation);
  next.push(input);
  return {
    ok: true,
    value: next.sort((a, b) =>
      a.seriesSlug.localeCompare(b.seriesSlug) || Number(b.primary) - Number(a.primary) ||
      a.franchiseSlug.localeCompare(b.franchiseSlug)),
  };
}

export function linkGameToFranchise(
  current: GameFranchiseRelation[],
  input: GameFranchiseRelation,
): DomainResult<GameFranchiseRelation[]> {
  const duplicate = current.some((relation) =>
    relation.gameId === input.gameId && relation.franchiseId === input.franchiseId);
  if (duplicate) return { ok: false, error: "El juego ya está vinculado a esa franquicia." };
  const next = current.map((relation) =>
    input.primary && relation.gameId === input.gameId ? { ...relation, primary: false } : relation);
  next.push({ ...input, inheritedFromSeriesSlugs: unique(input.inheritedFromSeriesSlugs) });
  return {
    ok: true,
    value: next.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.franchiseSlug.localeCompare(b.franchiseSlug)),
  };
}

export function propagateSeriesFranchiseMembership(input: {
  seriesSlug: string;
  gameIds: string[];
  seriesRelations: SeriesFranchiseRelation[];
  gameRelations: GameFranchiseRelation[];
  reviewedAt: string;
}): GameFranchiseRelation[] {
  const relevant = input.seriesRelations.filter((relation) => relation.seriesSlug === input.seriesSlug);
  const map = new Map(input.gameRelations.map((relation) => [
    `${relation.gameId}\0${relation.franchiseId}`,
    { ...relation, inheritedFromSeriesSlugs: [...relation.inheritedFromSeriesSlugs] },
  ]));

  for (const gameId of unique(input.gameIds)) {
    for (const seriesRelation of relevant) {
      const key = `${gameId}\0${seriesRelation.franchiseId}`;
      const current = map.get(key);
      const inheritedFromSeriesSlugs = unique([
        ...(current?.inheritedFromSeriesSlugs ?? []),
        input.seriesSlug,
      ]);
      const hasDirect = current?.membership === "direct" || current?.membership === "direct_and_inherited";
      map.set(key, {
        gameId,
        franchiseId: seriesRelation.franchiseId,
        franchiseSlug: seriesRelation.franchiseSlug,
        primary: current?.primary === true || seriesRelation.primary,
        membership: hasDirect ? "direct_and_inherited" : "inherited",
        inheritedFromSeriesSlugs,
        source: current?.source ?? "series-franchise-propagation",
        reviewedAt: input.reviewedAt,
        role: current?.role ?? null,
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.gameId.localeCompare(b.gameId) || a.franchiseSlug.localeCompare(b.franchiseSlug));
}

export function removeGameFranchiseMembership(input: {
  gameId: string;
  franchiseId: string;
  gameRelations: GameFranchiseRelation[];
  gameSeriesSlugs: string[];
  seriesRelations: SeriesFranchiseRelation[];
}): DomainResult<GameFranchiseRelation[]> {
  const requiredBySeries = input.seriesRelations.some((relation) =>
    relation.franchiseId === input.franchiseId && input.gameSeriesSlugs.includes(relation.seriesSlug));
  if (requiredBySeries) {
    return {
      ok: false,
      error: "No se puede retirar la franquicia mientras el juego siga vinculado a una saga que pertenece a ella.",
    };
  }
  return {
    ok: true,
    value: input.gameRelations.filter((relation) =>
      !(relation.gameId === input.gameId && relation.franchiseId === input.franchiseId)),
  };
}

const symmetricRelationships = new Set<RelationshipType>(["crossover_with"]);

function compareRef(a: RelationshipEntityRef, b: RelationshipEntityRef): number {
  return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
}

export function normalizeEntityRelationship(
  input: Omit<EntityRelationship, "id"> & { id?: string },
): DomainResult<EntityRelationship> {
  if (!ENTITY_TYPES.includes(input.sourceType) || !ENTITY_TYPES.includes(input.targetType)) {
    return { ok: false, error: "Tipo de entidad no válido." };
  }
  if (!RELATIONSHIP_TYPES.includes(input.relationshipType)) {
    return { ok: false, error: "Tipo de relación no válido." };
  }
  if (!input.sourceId.trim() || !input.targetId.trim()) {
    return { ok: false, error: "Origen y destino son obligatorios." };
  }
  if (input.sourceType === input.targetType && input.sourceId === input.targetId) {
    return { ok: false, error: "Una entidad no puede relacionarse consigo misma." };
  }

  let source = { type: input.sourceType, id: input.sourceId } satisfies RelationshipEntityRef;
  let target = { type: input.targetType, id: input.targetId } satisfies RelationshipEntityRef;
  let relationshipType = input.relationshipType;

  if (relationshipType === "prequel_to") {
    [source, target] = [target, source];
    relationshipType = "sequel_to";
  } else if (symmetricRelationships.has(relationshipType) && compareRef(source, target) > 0) {
    [source, target] = [target, source];
  }

  const id = `relationship:${source.type}:${source.id}:${relationshipType.replaceAll("_", "-")}:${target.type}:${target.id}`;
  return {
    ok: true,
    value: {
      id,
      sourceType: source.type,
      sourceId: source.id,
      targetType: target.type,
      targetId: target.id,
      relationshipType,
      source: input.source.trim(),
      confidence: input.confidence,
      reviewedAt: input.reviewedAt,
    },
  };
}

export function addEntityRelationship(
  current: EntityRelationship[],
  input: Omit<EntityRelationship, "id"> & { id?: string },
): DomainResult<EntityRelationship[]> {
  const normalized = normalizeEntityRelationship(input);
  if (!normalized.ok) return normalized;
  if (current.some((relationship) => relationship.id === normalized.value.id)) {
    return { ok: false, error: "La relación ya existe." };
  }
  return {
    ok: true,
    value: [...current, normalized.value].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function setGameFranchiseRole(
  current: GameFranchiseRelation[],
  gameId: string,
  franchiseId: string,
  role: FranchiseRole | null,
): DomainResult<GameFranchiseRelation[]> {
  let found = false;
  const value = current.map((relation) => {
    if (relation.gameId !== gameId || relation.franchiseId !== franchiseId) return relation;
    found = true;
    return { ...relation, role };
  });
  return found ? { ok: true, value } : { ok: false, error: "Membresía de franquicia no encontrada." };
}
