import assert from "node:assert/strict";
import test from "node:test";
import {
  addEntityRelationship,
  linkGameToFranchise,
  linkSeriesToFranchise,
  normalizeEntityRelationship,
  propagateSeriesFranchiseMembership,
  publishFranchiseEntity,
  removeGameFranchiseMembership,
  setGameFranchiseRole,
  upsertFranchiseEntity,
} from "./franchise-domain";
import type { FranchiseEntity, GameFranchiseRelation, SeriesFranchiseRelation } from "./franchise-types";

const reviewedAt = "2026-09-04";

function franchiseInput(overrides: Partial<Parameters<typeof upsertFranchiseEntity>[1]> = {}) {
  return {
    name: "Final Fantasy",
    source: "test",
    reviewedAt,
    ...overrides,
  };
}

function seriesRelation(overrides: Partial<SeriesFranchiseRelation> = {}): SeriesFranchiseRelation {
  return {
    seriesSlug: "final-fantasy-vii",
    franchiseId: "franchise:final-fantasy",
    franchiseSlug: "final-fantasy",
    primary: true,
    source: "test",
    confidence: "high",
    reviewedAt,
    ...overrides,
  };
}

function gameRelation(overrides: Partial<GameFranchiseRelation> = {}): GameFranchiseRelation {
  return {
    gameId: "game-1",
    franchiseId: "franchise:final-fantasy",
    franchiseSlug: "final-fantasy",
    primary: true,
    membership: "direct",
    inheritedFromSeriesSlugs: [],
    source: "test",
    reviewedAt,
    role: null,
    ...overrides,
  };
}

test("crea, edita y publica una franquicia sin cambiar su ID", () => {
  const created = upsertFranchiseEntity({}, franchiseInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value["final-fantasy"].id, "franchise:final-fantasy");
  assert.equal(created.value["final-fantasy"].status, "draft");

  const edited = upsertFranchiseEntity(created.value, franchiseInput({ description: "Perfil editorial." }));
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.value["final-fantasy"].id, "franchise:final-fantasy");
  assert.equal(edited.value["final-fantasy"].description, "Perfil editorial.");

  const published = publishFranchiseEntity(edited.value, "final-fantasy", reviewedAt);
  assert.equal(published.ok, true);
  if (published.ok) assert.equal(published.value["final-fantasy"].status, "published");
});

test("impide cambiar ID o slug de una franquicia existente", () => {
  const current: Record<string, FranchiseEntity> = {
    "final-fantasy": {
      id: "franchise:final-fantasy",
      slug: "final-fantasy",
      name: "Final Fantasy",
      status: "published",
      legacySeriesSlug: "final-fantasy",
      description: null,
      backgroundImageUrl: null,
      backgroundImageOpacity: null,
      backgroundReadability: null,
      source: "test",
      confidence: "high",
      reviewedAt,
    },
  };
  assert.equal(upsertFranchiseEntity(current, franchiseInput({ id: "franchise:otro" })).ok, false);
  assert.equal(
    upsertFranchiseEntity(current, franchiseInput({ id: "franchise:final-fantasy", slug: "otro" })).ok,
    false,
  );
});

test("series ↔ franchise admite varias franquicias y una sola principal", () => {
  const first = linkSeriesToFranchise([], seriesRelation());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = linkSeriesToFranchise(first.value, seriesRelation({
    franchiseId: "franchise:lego",
    franchiseSlug: "lego",
    primary: true,
  }));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.length, 2);
  assert.equal(second.value.filter((relation) => relation.primary).length, 1);
  assert.equal(second.value.find((relation) => relation.franchiseSlug === "lego")?.primary, true);
});

test("game ↔ franchise admite varias franquicias y evita duplicados", () => {
  const first = linkGameToFranchise([], gameRelation());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(linkGameToFranchise(first.value, gameRelation()).ok, false);
  const second = linkGameToFranchise(first.value, gameRelation({
    franchiseId: "franchise:lego",
    franchiseSlug: "lego",
    primary: false,
  }));
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.value.length, 2);
});

test("propaga saga → franquicia y conserva una membresía directa existente", () => {
  const propagated = propagateSeriesFranchiseMembership({
    seriesSlug: "final-fantasy-vii",
    gameIds: ["game-1", "game-2"],
    seriesRelations: [seriesRelation()],
    gameRelations: [gameRelation()],
    reviewedAt,
  });
  assert.equal(propagated.length, 2);
  assert.equal(propagated.find((relation) => relation.gameId === "game-1")?.membership, "direct_and_inherited");
  assert.equal(propagated.find((relation) => relation.gameId === "game-2")?.membership, "inherited");
});

test("bloquea retirar una franquicia requerida por una saga", () => {
  const blocked = removeGameFranchiseMembership({
    gameId: "game-1",
    franchiseId: "franchise:final-fantasy",
    gameRelations: [gameRelation()],
    gameSeriesSlugs: ["final-fantasy-vii"],
    seriesRelations: [seriesRelation()],
  });
  assert.equal(blocked.ok, false);

  const allowed = removeGameFranchiseMembership({
    gameId: "game-1",
    franchiseId: "franchise:final-fantasy",
    gameRelations: [gameRelation()],
    gameSeriesSlugs: [],
    seriesRelations: [seriesRelation()],
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.value.length, 0);
});

test("role es opcional y no sustituye una relación explícita", () => {
  const changed = setGameFranchiseRole(
    [gameRelation()],
    "game-1",
    "franchise:final-fantasy",
    "spin_off",
  );
  assert.equal(changed.ok, true);
  if (changed.ok) assert.equal(changed.value[0].role, "spin_off");
});

test("normaliza prequel como el inverso de sequel y evita el hecho duplicado", () => {
  const sequel = addEntityRelationship([], {
    sourceType: "game",
    sourceId: "game-b",
    targetType: "game",
    targetId: "game-a",
    relationshipType: "sequel_to",
    source: "test",
    confidence: "high",
    reviewedAt,
  });
  assert.equal(sequel.ok, true);
  if (!sequel.ok) return;
  const duplicate = addEntityRelationship(sequel.value, {
    sourceType: "game",
    sourceId: "game-a",
    targetType: "game",
    targetId: "game-b",
    relationshipType: "prequel_to",
    source: "test",
    confidence: "high",
    reviewedAt,
  });
  assert.equal(duplicate.ok, false);
});

test("crossover es simétrico y se almacena con orden estable", () => {
  const forward = normalizeEntityRelationship({
    sourceType: "franchise",
    sourceId: "franchise:rabbids",
    targetType: "franchise",
    targetId: "franchise:mario",
    relationshipType: "crossover_with",
    source: "test",
    confidence: "high",
    reviewedAt,
  });
  const reverse = normalizeEntityRelationship({
    sourceType: "franchise",
    sourceId: "franchise:mario",
    targetType: "franchise",
    targetId: "franchise:rabbids",
    relationshipType: "crossover_with",
    source: "test",
    confidence: "high",
    reviewedAt,
  });
  assert.equal(forward.ok, true);
  assert.equal(reverse.ok, true);
  if (forward.ok && reverse.ok) assert.equal(forward.value.id, reverse.value.id);
});

for (const relationshipType of [
  "spin_off_of",
  "remake_of",
  "remaster_of",
  "reboot_of",
  "derived_from",
  "expansion_of",
  "standalone_expansion_of",
  "compilation_of",
] as const) {
  test(`admite la relación ${relationshipType}`, () => {
    const relationship = normalizeEntityRelationship({
      sourceType: "game",
      sourceId: "game-b",
      targetType: "game",
      targetId: "game-a",
      relationshipType,
      source: "test",
      confidence: "high",
      reviewedAt,
    });
    assert.equal(relationship.ok, true);
  });
}

test("rechaza autorrelaciones", () => {
  assert.equal(normalizeEntityRelationship({
    sourceType: "game",
    sourceId: "game-a",
    targetType: "game",
    targetId: "game-a",
    relationshipType: "remake_of",
    source: "test",
    confidence: "high",
    reviewedAt,
  }).ok, false);
});
