import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mapping = JSON.parse(readFileSync("data/facet-external-signal-mapping.json", "utf8"));
const taxonomy = JSON.parse(readFileSync("data/game-facets-taxonomy.json", "utf8"));
const entities = [...taxonomy.genres, ...taxonomy.subgenres, ...taxonomy.facets];
const byId = new Map(entities.map((entity) => [entity.id, entity]));

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function explicit(source, signal) {
  const normalized = normalize(signal);
  return mapping.find((entry) => entry.source === source && normalize(entry.signal) === normalized);
}

function alias(signal) {
  const normalized = normalize(signal);
  return entities.find((entity) => {
    const terms = [
      entity.name,
      entity.nameEn,
      entity.slug,
      entity.canonicalSlug,
      ...(entity.aliases ?? []),
      ...(entity.searchAliases ?? []),
    ].filter(Boolean);
    return terms.some((term) => normalize(term) === normalized);
  });
}

const metroidvania = explicit("steam", "Metroidvania");
assert.equal(metroidvania?.targetId, "metroidvania");
assert.equal(byId.get(metroidvania.targetId)?.type, metroidvania.targetType);

const soccer = explicit("steam", "Soccer");
assert.equal(soccer?.targetId, "football");
assert.equal(byId.get(soccer.targetId)?.type, soccer.targetType);

const pixel = explicit("steam", "Pixel Graphics");
assert.equal(pixel?.targetId, "pixel-art");

const vandal = explicit("vandal", "Aventura de acción");
assert.equal(vandal?.targetId, "action-adventure");

const horrorAlias = alias("juegos de terror");
assert.equal(horrorAlias?.id, "horror");

assert.equal(explicit("steam", "not a real external tag at all"), undefined);
assert.equal(alias("not a real external tag at all"), undefined);

const duplicateKeys = new Set();
for (const entry of mapping) {
  const key = `${entry.source}:${normalize(entry.signal)}`;
  assert.equal(duplicateKeys.has(key), false, `Duplicado: ${key}`);
  duplicateKeys.add(key);
}

console.log("FACET_EXTERNAL_SIGNAL_MAPPING_V1 tests OK");
