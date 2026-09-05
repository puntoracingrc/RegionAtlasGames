import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  filterEffectiveSeriesCatalogIds,
  getFranchiseCurationMetadata,
  getFranchiseEditorialOverride,
  getFranchiseEditorialOverrides,
  getMembershipExclusion,
  getMembershipExclusions,
} from "../src/lib/franchise-curation";

type Classification = "franchise" | "series" | "ambiguous";
type Confidence = "high" | "medium" | "low";

type SeriesEntry = {
  name: string;
  slug: string;
  gameIds: string[];
  description?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number | null;
  backgroundReadability?: "soft" | "normal" | "strong" | null;
};

type EffectiveOverlay = {
  source?: string;
  series?: Record<string, Partial<SeriesEntry> & { additions?: string[]; removals?: string[] }>;
};

type ClassificationEntry = {
  slug: string;
  name: string;
  classification: Classification;
  catalogEntryCount: number;
  proposedFranchise: string | null;
  relatedFranchises: string[];
  primaryFranchise: string | null;
  confidence: Confidence;
  source: string;
  notes: string;
};

type ClassificationFile = {
  schemaVersion: number;
  baselineRevision: string;
  source: string;
  entries: Record<string, ClassificationEntry>;
};

type OverrideFile = {
  reviewedAt: string;
  additionalFranchises: Array<{
    id: string;
    slug: string;
    name: string;
    status: "draft" | "published";
    confidence: Confidence;
    notes: string;
  }>;
};

type FranchiseEntity = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published";
  legacySeriesSlug: string | null;
  description: string | null;
  backgroundImageUrl: string | null;
  backgroundImageOpacity: number | null;
  backgroundReadability: "soft" | "normal" | "strong" | null;
  source: string;
  confidence: Confidence;
  reviewedAt: string;
};

type SeriesFranchiseRelation = {
  seriesSlug: string;
  franchiseId: string;
  franchiseSlug: string;
  primary: boolean;
  source: string;
  confidence: Confidence;
  reviewedAt: string;
};

type GameFranchiseRelation = {
  /** Existing catalog_id for one catalogued edition, not a logical game work. */
  gameId: string;
  franchiseId: string;
  franchiseSlug: string;
  primary: boolean;
  membership: "direct" | "inherited" | "direct_and_inherited";
  inheritedFromSeriesSlugs: string[];
  source: string;
  reviewedAt: string;
  role: null;
};

const ROOT = process.cwd();
const SYSTEM_DIR = path.join(ROOT, "data", "franchise-system");
const MIGRATION_DIR = path.join(ROOT, "data", "migrations", "franchise-series-v1");
const mode = process.argv.includes("--write")
  ? "write"
  : process.argv.includes("--check")
    ? "check"
    : "dry-run";

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function effectiveSeries(
  staticSeries: Record<string, SeriesEntry>,
  overlay: EffectiveOverlay,
): Record<string, SeriesEntry> {
  const result: Record<string, SeriesEntry> = {};
  for (const slug of unique([...Object.keys(staticSeries), ...Object.keys(overlay.series ?? {})]).sort()) {
    const base = staticSeries[slug];
    const patch = overlay.series?.[slug];
    if (!base && !patch) continue;
    const baseGameIds = overlay.source === "production-admin-api-read-only" && patch?.gameIds
      ? patch.gameIds
      : base?.gameIds ?? patch?.gameIds ?? [];
    const removals = new Set(patch?.removals ?? []);
    result[slug] = {
      name: patch?.name ?? base?.name ?? slug,
      slug,
      gameIds: unique([...baseGameIds, ...(patch?.additions ?? [])]).filter((id) => !removals.has(id)),
      description: patch?.description ?? base?.description ?? null,
      backgroundImageUrl: patch?.backgroundImageUrl ?? base?.backgroundImageUrl ?? null,
      backgroundImageOpacity: patch?.backgroundImageOpacity ?? base?.backgroundImageOpacity ?? null,
      backgroundReadability: patch?.backgroundReadability ?? base?.backgroundReadability ?? null,
    };
  }
  return result;
}

function writeOrCheck(filePath: string, value: unknown) {
  const next = stableJson(value);
  if (mode === "dry-run") return;
  if (mode === "check") {
    const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    if (current !== next) throw new Error(`Franchise artifact out of date: ${path.relative(ROOT, filePath)}`);
    return;
  }
  writeFileSync(filePath, next, "utf8");
}

const classification = readJson<ClassificationFile>(path.join(SYSTEM_DIR, "series-classification.json"));
const overrides = readJson<OverrideFile>(path.join(SYSTEM_DIR, "classification-overrides.json"));
const staticSeries = readJson<Record<string, SeriesEntry>>(path.join(ROOT, "data", "index", "series.json"));
const productionOverlay = readJson<EffectiveOverlay>(path.join(MIGRATION_DIR, "production-series-overlay-effective.json"));
const series = effectiveSeries(staticSeries, productionOverlay);
const membershipExclusions = getMembershipExclusions();
const franchiseEditorialOverrides = getFranchiseEditorialOverrides();
const curationMetadata = getFranchiseCurationMetadata();

const franchises = new Map<string, FranchiseEntity>();
for (const entry of Object.values(classification.entries)) {
  if (entry.classification !== "franchise" || entry.confidence !== "high") continue;
  const legacy = series[entry.slug];
  if (!legacy) throw new Error(`Missing effective legacy series: ${entry.slug}`);
  const slug = entry.proposedFranchise ?? entry.slug;
  const editorialOverride = getFranchiseEditorialOverride(slug);
  franchises.set(slug, {
    id: `franchise:${slug}`,
    slug,
    name: legacy.name,
    status: "published",
    legacySeriesSlug: entry.slug,
    description: editorialOverride ? editorialOverride.description : legacy.description ?? null,
    backgroundImageUrl: legacy.backgroundImageUrl ?? null,
    backgroundImageOpacity: legacy.backgroundImageOpacity ?? null,
    backgroundReadability: legacy.backgroundReadability ?? null,
    source: entry.source,
    confidence: entry.confidence,
    reviewedAt: overrides.reviewedAt,
  });
}

for (const entry of overrides.additionalFranchises) {
  if (franchises.has(entry.slug)) throw new Error(`Duplicate franchise slug: ${entry.slug}`);
  franchises.set(entry.slug, {
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    status: entry.status,
    legacySeriesSlug: null,
    description: null,
    backgroundImageUrl: null,
    backgroundImageOpacity: null,
    backgroundReadability: null,
    source: classification.source,
    confidence: entry.confidence,
    reviewedAt: overrides.reviewedAt,
  });
}

const seriesFranchiseRelations: SeriesFranchiseRelation[] = [];
for (const entry of Object.values(classification.entries)) {
  if (entry.classification !== "series" || entry.confidence !== "high") continue;
  if (!entry.primaryFranchise || !entry.relatedFranchises.includes(entry.primaryFranchise)) {
    throw new Error(`Series must include its primary franchise: ${entry.slug}`);
  }
  for (const franchiseSlug of entry.relatedFranchises) {
    const franchise = franchises.get(franchiseSlug);
    if (!franchise) throw new Error(`Unknown franchise ${franchiseSlug} for ${entry.slug}`);
    seriesFranchiseRelations.push({
      seriesSlug: entry.slug,
      franchiseId: franchise.id,
      franchiseSlug,
      primary: franchiseSlug === entry.primaryFranchise,
      source: entry.source,
      confidence: entry.confidence,
      reviewedAt: overrides.reviewedAt,
    });
  }
}
seriesFranchiseRelations.sort((a, b) =>
  a.seriesSlug.localeCompare(b.seriesSlug) || Number(b.primary) - Number(a.primary) ||
  a.franchiseSlug.localeCompare(b.franchiseSlug));

const membershipMap = new Map<string, GameFranchiseRelation>();
type MembershipInput = Pick<
  GameFranchiseRelation,
  "gameId" | "franchiseId" | "franchiseSlug" | "primary" | "source" | "reviewedAt"
> & {
  direct: boolean;
  inheritedFromSeriesSlug?: string;
};

function upsertMembership(input: MembershipInput) {
  if (getMembershipExclusion(input.gameId, "franchise", input.franchiseId)) return;
  const key = `${input.gameId}\0${input.franchiseId}`;
  const current = membershipMap.get(key);
  const inheritedFromSeriesSlugs = unique([
    ...(current?.inheritedFromSeriesSlugs ?? []),
    input.inheritedFromSeriesSlug ?? "",
  ]).sort();
  const wasDirect = current?.membership === "direct" || current?.membership === "direct_and_inherited";
  const hasDirect = wasDirect || input.direct;
  const hasInherited = inheritedFromSeriesSlugs.length > 0;
  membershipMap.set(key, {
    gameId: input.gameId,
    franchiseId: input.franchiseId,
    franchiseSlug: input.franchiseSlug,
    primary: current?.primary === true || input.primary,
    membership: hasDirect && hasInherited ? "direct_and_inherited" : hasDirect ? "direct" : "inherited",
    inheritedFromSeriesSlugs,
    source: input.source,
    reviewedAt: input.reviewedAt,
    role: null,
  });
}

for (const franchise of franchises.values()) {
  if (!franchise.legacySeriesSlug) continue;
  for (const gameId of series[franchise.legacySeriesSlug]?.gameIds ?? []) {
    upsertMembership({
      gameId,
      franchiseId: franchise.id,
      franchiseSlug: franchise.slug,
      primary: true,
      direct: true,
      source: "legacy-series-promotion",
      reviewedAt: overrides.reviewedAt,
    });
  }
}

for (const relation of seriesFranchiseRelations) {
  const effectiveSeriesCatalogIds = filterEffectiveSeriesCatalogIds(
    relation.seriesSlug,
    series[relation.seriesSlug]?.gameIds ?? [],
  );
  for (const gameId of effectiveSeriesCatalogIds) {
    upsertMembership({
      gameId,
      franchiseId: relation.franchiseId,
      franchiseSlug: relation.franchiseSlug,
      primary: relation.primary,
      direct: false,
      inheritedFromSeriesSlug: relation.seriesSlug,
      source: "series-franchise-propagation",
      reviewedAt: overrides.reviewedAt,
    });
  }
}

const gameFranchiseRelations = [...membershipMap.values()].sort((a, b) =>
  a.gameId.localeCompare(b.gameId) || a.franchiseSlug.localeCompare(b.franchiseSlug));

const legacyRedirects = [...franchises.values()]
  .filter((franchise) => franchise.legacySeriesSlug)
  .map((franchise) => ({
    source: `/saga/${franchise.legacySeriesSlug}`,
    destination: `/franquicia/${franchise.slug}`,
    permanent: true,
    legacySeriesSlug: franchise.legacySeriesSlug,
    franchiseId: franchise.id,
  }))
  .sort((a, b) => a.source.localeCompare(b.source));

const entityRelationships = [
  {
    id: "relationship:series:mega-man-x:derived-from:franchise:mega-man",
    sourceType: "series",
    sourceId: "mega-man-x",
    targetType: "franchise",
    targetId: "franchise:mega-man",
    relationshipType: "derived_from",
    source: classification.source,
    confidence: "high",
    reviewedAt: overrides.reviewedAt,
  },
];

const franchiseEntities = Object.fromEntries([...franchises.values()]
  .sort((a, b) => a.slug.localeCompare(b.slug))
  .map((franchise) => [franchise.slug, franchise]));

const directGameIdsByFranchise = new Map<string, string[]>();
const inheritedGameIdsByFranchise = new Map<string, string[]>();
for (const relation of gameFranchiseRelations) {
  if (relation.membership === "direct" || relation.membership === "direct_and_inherited") {
    directGameIdsByFranchise.set(relation.franchiseSlug, [
      ...(directGameIdsByFranchise.get(relation.franchiseSlug) ?? []),
      relation.gameId,
    ]);
  }
  if (relation.membership === "inherited" || relation.membership === "direct_and_inherited") {
    inheritedGameIdsByFranchise.set(relation.franchiseSlug, [
      ...(inheritedGameIdsByFranchise.get(relation.franchiseSlug) ?? []),
      relation.gameId,
    ]);
  }
}

const promotions = [...franchises.values()]
  .filter((franchise) => franchise.legacySeriesSlug)
  .map((franchise) => {
    const legacyGameIds = series[franchise.legacySeriesSlug!]?.gameIds ?? [];
    const approvedExclusions = membershipExclusions.filter((entry) =>
      entry.entityType === "franchise" &&
      entry.entityId === franchise.id &&
      legacyGameIds.includes(entry.catalogId));
    const approvedExcludedCatalogIds = approvedExclusions.map((entry) => entry.catalogId).sort();
    const expectedDirectGameIds = legacyGameIds.filter((id) => !approvedExcludedCatalogIds.includes(id));
    const directGameIds = unique(directGameIdsByFranchise.get(franchise.slug) ?? []);
    const inheritedGameIds = unique(inheritedGameIdsByFranchise.get(franchise.slug) ?? []);
    return {
      legacy: {
        type: "series",
        slug: franchise.legacySeriesSlug,
        catalogEntries: legacyGameIds.length,
      },
      target: {
        type: "franchise",
        id: franchise.id,
        slug: franchise.slug,
        directCatalogEntries: directGameIds.length,
        effectiveCatalogEntries: unique([...directGameIds, ...inheritedGameIds]).length,
      },
      approvedExcludedCatalogIds,
      lostDirectCatalogIds: expectedDirectGameIds.filter((id) => !directGameIds.includes(id)),
      unexpectedDirectCatalogIds: directGameIds.filter((id) => !expectedDirectGameIds.includes(id)),
      inheritedCatalogIds: inheritedGameIds.filter((id) => !directGameIds.includes(id)),
      effectiveDirectMembershipParity: expectedDirectGameIds.length === directGameIds.length &&
        expectedDirectGameIds.every((id) => directGameIds.includes(id)),
      redirect: `/saga/${franchise.legacySeriesSlug} -> /franquicia/${franchise.slug}`,
    };
  })
  .sort((a, b) => (a.legacy.slug ?? "").localeCompare(b.legacy.slug ?? ""));

if (promotions.some((promotion) => !promotion.effectiveDirectMembershipParity)) {
  throw new Error("A promoted franchise does not match legacy membership after approved exclusions.");
}

const report = {
  schemaVersion: 1,
  baselineRevision: classification.baselineRevision,
  counts: {
    franchises: franchises.size,
    promotedLegacySeries: promotions.length,
    retainedSeries: seriesFranchiseRelations.filter((relation) => relation.primary).length,
    seriesFranchiseRelations: seriesFranchiseRelations.length,
    catalogEntryFranchiseRelations: gameFranchiseRelations.length,
    entityRelationships: entityRelationships.length,
    legacyRedirects: legacyRedirects.length,
    approvedMembershipExclusions: membershipExclusions.length,
    franchiseEditorialOverrides: Object.keys(franchiseEditorialOverrides).length,
  },
  promotions,
  curation: {
    ...curationMetadata,
    membershipExclusions,
    franchiseEditorialOverrides,
  },
  identifierSemantics: {
    persistedField: "gameId",
    meaning: "Existing catalog_id for one catalogued edition; not a logical game work.",
  },
  unchanged: {
    catalogFile: "data/catalog.json",
    gameDetailsFile: "data/game-details.json",
    companyIndexFile: "data/index/companies.json",
    seriesIndexFile: "data/index/series.json",
  },
};

writeOrCheck(path.join(SYSTEM_DIR, "franchises.json"), {
  schemaVersion: 1,
  baselineRevision: classification.baselineRevision,
  entities: franchiseEntities,
});
writeOrCheck(path.join(SYSTEM_DIR, "series-franchise-relations.json"), {
  schemaVersion: 1,
  relations: seriesFranchiseRelations,
});
writeOrCheck(path.join(SYSTEM_DIR, "game-franchise-relations.json"), {
  schemaVersion: 1,
  relations: gameFranchiseRelations,
});
writeOrCheck(path.join(SYSTEM_DIR, "entity-relationships.json"), {
  schemaVersion: 1,
  relationships: entityRelationships,
});
writeOrCheck(path.join(SYSTEM_DIR, "legacy-series-redirects.json"), {
  schemaVersion: 1,
  redirects: legacyRedirects,
});
writeOrCheck(path.join(MIGRATION_DIR, "migration-dry-run.json"), report);

console.log(stableJson({ mode, ...report }));
