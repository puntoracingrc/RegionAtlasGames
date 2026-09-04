import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { buildCatalogSeoSlug } from "../src/lib/catalog-path";
import type {
  EntityRelationship,
  FranchiseEntity,
  GameFranchiseRelation,
  LegacySeriesRedirect,
  SeriesClassificationEntry,
  SeriesFranchiseRelation,
} from "../src/lib/franchise-types";

type CatalogGame = {
  id: string;
  slug: string;
  title: string;
  platformSlug: string;
  region: string;
  listingStatus: string;
};

type SnapshotSeries = {
  slug: string;
  name: string;
  url: string;
  catalogEntryCount: number;
  gameIds: string[];
  editorial: {
    description: string | null;
    backgroundImageUrl: string | null;
    backgroundImageOpacity: number | null;
    backgroundReadability: string | null;
    museumPath: string | null;
  };
};

type Snapshot = {
  schemaVersion: number;
  baselineRevision: string;
  counts: { catalogEntries: number; companies: number; legacySeries: number };
  checksums: {
    catalogIdentitySha256: string;
    companyIdentitySha256: string;
    legacySeriesMembershipSha256: string;
    protectedFilesSha256: Record<string, string>;
  };
  catalogIdentity: Array<{ id: string; slug: string; url: string; listingStatus: string }>;
  companySlugs: string[];
  series: Record<string, SnapshotSeries>;
};

type RollbackManifest = {
  baselineRevision: string;
  identifierSemantics: { persistedField: string; meaning: string };
  protectedFilesSha256: Record<string, string>;
  legacyState: {
    legacySeriesCount: number;
    membershipSha256: string;
  };
  promotedLegacySeries: Array<{
    legacySeriesSlug: string;
    franchiseSlug: string;
    catalogIds: string[];
    catalogIdsSha256: string;
  }>;
  retainedSeries: Array<{
    seriesSlug: string;
    catalogIds: string[];
    catalogIdsSha256: string;
  }>;
};

const EXPECTED_PROMOTED_SERIES = [
  "final-fantasy",
  "lego",
  "mega-man",
  "need-for-speed",
  "resident-evil",
  "sonic-the-hedgehog",
  "star-wars",
  "time-crisis",
] as const;
const EXPECTED_RETAINED_SERIES = [
  "dissidia-final-fantasy",
  "lego-batman",
  "lego-harry-potter",
  "lego-racers",
  "lego-star-wars",
  "mega-man-x",
  "super-mario",
] as const;

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "data", "migrations", "franchise-series-v1");
const JSON_OUTPUT = path.join(OUTPUT_DIR, "post-migration-report.json");
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, "post-migration-report.md");
const checkOnly = process.argv.includes("--check");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function fileSha256(relativePath: string): string {
  return createHash("sha256").update(readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function writeOrCheck(filePath: string, content: unknown) {
  const next = typeof content === "string" ? content : stableJson(content);
  if (checkOnly) {
    const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    if (current !== next) throw new Error(`Artifact out of date: ${path.relative(ROOT, filePath)}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, next, "utf8");
}

const snapshot = JSON.parse(
  gunzipSync(readFileSync(path.join(OUTPUT_DIR, "pre-migration-snapshot.json.gz"))).toString("utf8"),
) as Snapshot;
const catalog = readJson<CatalogGame[]>("data/catalog.json");
const companyIndex = readJson<Record<string, unknown>>("data/index/companies.json");
const franchiseFile = readJson<{ entities: Record<string, FranchiseEntity> }>("data/franchise-system/franchises.json");
const gameRelationFile = readJson<{ relations: GameFranchiseRelation[] }>("data/franchise-system/game-franchise-relations.json");
const seriesRelationFile = readJson<{ relations: SeriesFranchiseRelation[] }>("data/franchise-system/series-franchise-relations.json");
const relationshipFile = readJson<{ relationships: EntityRelationship[] }>("data/franchise-system/entity-relationships.json");
const redirectFile = readJson<{ redirects: LegacySeriesRedirect[] }>("data/franchise-system/legacy-series-redirects.json");
const classificationFile = readJson<{ entries: Record<string, SeriesClassificationEntry> }>(
  "data/franchise-system/series-classification.json",
);
const rollbackManifest = readJson<RollbackManifest>("data/migrations/franchise-series-v1/rollback-manifest.json");

const catalogIdentity = catalog.map((game) => ({
  id: game.id,
  slug: game.slug,
  url: `/catalogo/${buildCatalogSeoSlug(game)}`,
  listingStatus: game.listingStatus,
}));
const companySlugs = Object.keys(companyIndex).sort();
const currentCatalogIds = catalog.map((game) => game.id);
const baselineCatalogIds = snapshot.catalogIdentity.map((game) => game.id);
const catalogIdSet = new Set(currentCatalogIds);
const catalogUrls = catalogIdentity.map((game) => game.url);
const uniqueCatalogUrlCount = new Set(catalogUrls).size;
const franchiseIdSet = new Set(Object.values(franchiseFile.entities).map((franchise) => franchise.id));
const redirectBySlug = new Map(redirectFile.redirects.map((redirect) => [redirect.legacySeriesSlug, redirect]));
const classificationRows = Object.values(classificationFile.entries);
const promotedClassificationSlugs = classificationRows
  .filter((row) => row.classification === "franchise" && row.confidence === "high")
  .map((row) => row.slug)
  .sort();
const retainedClassificationSlugs = classificationRows
  .filter((row) => row.classification === "series" && row.confidence === "high")
  .map((row) => row.slug)
  .sort();
const ambiguousClassificationRows = classificationRows.filter((row) => row.classification === "ambiguous");
const protectedFileMismatches = Object.entries(snapshot.checksums.protectedFilesSha256)
  .filter(([relativePath, expected]) => !existsSync(path.join(ROOT, relativePath)) || fileSha256(relativePath) !== expected)
  .map(([relativePath]) => relativePath);

const promotionRows = Object.values(franchiseFile.entities)
  .filter((franchise) => franchise.legacySeriesSlug)
  .map((franchise) => {
    const legacySlug = franchise.legacySeriesSlug!;
    const legacy = snapshot.series[legacySlug];
    const directGameIds = gameRelationFile.relations
      .filter((relation) =>
        relation.franchiseId === franchise.id &&
        (relation.membership === "direct" || relation.membership === "direct_and_inherited"),
      )
      .map((relation) => relation.gameId)
      .sort();
    const legacyGameIds = [...(legacy?.gameIds ?? [])].sort();
    const redirect = redirectBySlug.get(legacySlug);
    const editorialPreserved = Boolean(legacy) &&
      franchise.description === legacy.editorial.description &&
      franchise.backgroundImageUrl === legacy.editorial.backgroundImageUrl &&
      franchise.backgroundImageOpacity === legacy.editorial.backgroundImageOpacity &&
      franchise.backgroundReadability === legacy.editorial.backgroundReadability;
    return {
      slug: legacySlug,
      legacyCatalogEntries: legacyGameIds.length,
      franchiseCatalogEntries: directGameIds.length,
      lostCatalogIds: legacyGameIds.filter((id) => !directGameIds.includes(id)),
      unexpectedCatalogIds: directGameIds.filter((id) => !legacyGameIds.includes(id)),
      membershipParity: sameArray(legacyGameIds, directGameIds),
      editorialPreserved,
      redirect: redirect?.source === `/saga/${legacySlug}` &&
        redirect.destination === `/franquicia/${franchise.slug}` &&
        redirect.permanent === true,
      canonical: `/franquicia/${franchise.slug}`,
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

const seriesPropagationFailures = seriesRelationFile.relations.flatMap((seriesRelation) => {
  const legacyGameIds = snapshot.series[seriesRelation.seriesSlug]?.gameIds ?? [];
  return legacyGameIds
    .filter((gameId) => !gameRelationFile.relations.some((gameRelation) =>
      gameRelation.gameId === gameId &&
      gameRelation.franchiseId === seriesRelation.franchiseId &&
      gameRelation.inheritedFromSeriesSlugs.includes(seriesRelation.seriesSlug),
    ))
    .map((gameId) => ({ seriesSlug: seriesRelation.seriesSlug, franchiseId: seriesRelation.franchiseId, gameId }));
});

const duplicateGameMemberships = gameRelationFile.relations
  .map((relation) => `${relation.gameId}\0${relation.franchiseId}`)
  .filter((key, index, all) => all.indexOf(key) !== index);
const duplicateSeriesMemberships = seriesRelationFile.relations
  .map((relation) => `${relation.seriesSlug}\0${relation.franchiseId}`)
  .filter((key, index, all) => all.indexOf(key) !== index);
const multiplePrimarySeries = [...new Set(seriesRelationFile.relations.map((relation) => relation.seriesSlug))]
  .filter((seriesSlug) => seriesRelationFile.relations.filter((relation) => relation.seriesSlug === seriesSlug && relation.primary).length > 1);
const multiplePrimaryGames = [...new Set(gameRelationFile.relations.map((relation) => relation.gameId))]
  .filter((gameId) => gameRelationFile.relations.filter((relation) => relation.gameId === gameId && relation.primary).length > 1);
const orphanGameRelations = gameRelationFile.relations.filter((relation) => !catalogIdSet.has(relation.gameId));
const orphanFranchiseRelations = [
  ...gameRelationFile.relations.filter((relation) => !franchiseIdSet.has(relation.franchiseId)).map((relation) => relation.franchiseId),
  ...seriesRelationFile.relations.filter((relation) => !franchiseIdSet.has(relation.franchiseId)).map((relation) => relation.franchiseId),
];
const orphanSeriesRelations = seriesRelationFile.relations
  .filter((relation) => !snapshot.series[relation.seriesSlug])
  .map((relation) => relation.seriesSlug);
const ambiguousLegacyChanges = ambiguousClassificationRows
  .filter((row) =>
    !snapshot.series[row.slug] ||
    redirectBySlug.has(row.slug) ||
    Object.values(franchiseFile.entities).some((franchise) => franchise.legacySeriesSlug === row.slug) ||
    seriesRelationFile.relations.some((relation) => relation.seriesSlug === row.slug),
  )
  .map((row) => row.slug);
const catalogIdsWithMultipleFranchises = [...catalogIdSet].filter((catalogId) =>
  new Set(
    gameRelationFile.relations
      .filter((relation) => relation.gameId === catalogId)
      .map((relation) => relation.franchiseId),
  ).size > 1,
);
const legoStarWarsRelations = seriesRelationFile.relations
  .filter((relation) => relation.seriesSlug === "lego-star-wars")
  .map((relation) => `${relation.franchiseSlug}:${relation.primary}`)
  .sort();
const expectedRelationship = relationshipFile.relationships.length === 1 &&
  relationshipFile.relationships[0]?.sourceType === "series" &&
  relationshipFile.relationships[0]?.sourceId === "mega-man-x" &&
  relationshipFile.relationships[0]?.targetType === "franchise" &&
  relationshipFile.relationships[0]?.targetId === "franchise:mega-man" &&
  relationshipFile.relationships[0]?.relationshipType === "derived_from";
const rollbackPromotionSlugs = rollbackManifest.promotedLegacySeries
  .map((entry) => entry.legacySeriesSlug)
  .sort();
const rollbackSeriesSlugs = rollbackManifest.retainedSeries
  .map((entry) => entry.seriesSlug)
  .sort();
const rollbackMembershipsMatch = [
  ...rollbackManifest.promotedLegacySeries.map((entry) => ({ slug: entry.legacySeriesSlug, ...entry })),
  ...rollbackManifest.retainedSeries.map((entry) => ({ slug: entry.seriesSlug, ...entry })),
].every((entry) => {
  const legacy = snapshot.series[entry.slug];
  return Boolean(legacy) &&
    sameArray(entry.catalogIds, legacy.gameIds) &&
    entry.catalogIdsSha256 === sha256(legacy.gameIds);
});

const legacyUrlOutcomes = Object.keys(snapshot.series).sort().map((slug) => ({
  url: `/saga/${slug}`,
  outcome: redirectBySlug.has(slug) ? "permanent_redirect" : "200",
  destination: redirectBySlug.get(slug)?.destination ?? null,
}));

const checks = {
  catalogCount: catalog.length === snapshot.counts.catalogEntries,
  catalogIdsUnique: catalogIdSet.size === catalog.length,
  catalogUrlsUnique: uniqueCatalogUrlCount === catalogUrls.length,
  catalogIdsAndOrder: sameArray(currentCatalogIds, baselineCatalogIds),
  catalogIdentityChecksum: sha256(catalogIdentity) === snapshot.checksums.catalogIdentitySha256,
  companyCount: companySlugs.length === snapshot.counts.companies,
  companyIdentityChecksum: sha256(companySlugs) === snapshot.checksums.companyIdentitySha256,
  protectedBaseFiles: protectedFileMismatches.length === 0,
  exactApprovedClassification:
    sameArray(promotedClassificationSlugs, [...EXPECTED_PROMOTED_SERIES].sort()) &&
    sameArray(retainedClassificationSlugs, [...EXPECTED_RETAINED_SERIES].sort()) &&
    ambiguousClassificationRows.length === 412,
  exactApprovedMigrationScope:
    Object.keys(franchiseFile.entities).length === 9 &&
    promotionRows.length === 8 &&
    seriesRelationFile.relations.length === 8 &&
    gameRelationFile.relations.length === 340 &&
    relationshipFile.relationships.length === 1 &&
    redirectFile.redirects.length === 8,
  ambiguousLegacyUntouched: ambiguousLegacyChanges.length === 0,
  promotionMembershipParity: promotionRows.every((row) => row.membershipParity),
  promotionEditorialPreserved: promotionRows.every((row) => row.editorialPreserved),
  promotionRedirects: promotionRows.every((row) => row.redirect),
  everyLegacyUrlHasOutcome: legacyUrlOutcomes.length === snapshot.counts.legacySeries &&
    legacyUrlOutcomes.every((row) => row.outcome === "200" || row.outcome === "permanent_redirect"),
  exactLegacyUrlOutcomes:
    legacyUrlOutcomes.length === 427 &&
    legacyUrlOutcomes.filter((row) => row.outcome === "permanent_redirect").length === 8 &&
    legacyUrlOutcomes.filter((row) => row.outcome === "200").length === 419,
  seriesPropagation: seriesPropagationFailures.length === 0,
  noDuplicateMemberships: duplicateGameMemberships.length === 0 && duplicateSeriesMemberships.length === 0,
  noMultiplePrimaryMemberships: multiplePrimarySeries.length === 0 && multiplePrimaryGames.length === 0,
  noOrphanRelations:
    orphanGameRelations.length === 0 &&
    orphanFranchiseRelations.length === 0 &&
    orphanSeriesRelations.length === 0,
  manyToManyMembership:
    sameArray(legoStarWarsRelations, ["lego:true", "star-wars:false"]) &&
    catalogIdsWithMultipleFranchises.length > 0,
  approvedEntityRelationship: expectedRelationship,
  gameIdMeansExistingCatalogId: orphanGameRelations.length === 0,
  rollbackManifest:
    rollbackManifest.baselineRevision === snapshot.baselineRevision &&
    rollbackManifest.identifierSemantics.persistedField === "gameId" &&
    rollbackManifest.identifierSemantics.meaning.includes("catalog_id") &&
    rollbackManifest.legacyState.legacySeriesCount === snapshot.counts.legacySeries &&
    rollbackManifest.legacyState.membershipSha256 === snapshot.checksums.legacySeriesMembershipSha256 &&
    sameArray(rollbackPromotionSlugs, [...EXPECTED_PROMOTED_SERIES].sort()) &&
    sameArray(rollbackSeriesSlugs, [...EXPECTED_RETAINED_SERIES].sort()) &&
    rollbackMembershipsMatch &&
    sha256(rollbackManifest.protectedFilesSha256) === sha256(snapshot.checksums.protectedFilesSha256),
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  schemaVersion: 1,
  baselineRevision: snapshot.baselineRevision,
  identifierSemantics: rollbackManifest.identifierSemantics,
  counts: {
    catalogEntriesBefore: snapshot.counts.catalogEntries,
    catalogEntriesAfter: catalog.length,
    uniqueCatalogIdsBefore: new Set(baselineCatalogIds).size,
    uniqueCatalogIdsAfter: catalogIdSet.size,
    companiesBefore: snapshot.counts.companies,
    companiesAfter: companySlugs.length,
    legacySeriesUrls: legacyUrlOutcomes.length,
    permanentRedirects: legacyUrlOutcomes.filter((row) => row.outcome === "permanent_redirect").length,
    retainedLegacyPages: legacyUrlOutcomes.filter((row) => row.outcome === "200").length,
    franchises: Object.keys(franchiseFile.entities).length,
    promotedLegacySeries: promotedClassificationSlugs.length,
    retainedSeries: retainedClassificationSlugs.length,
    catalogEntryFranchiseRelations: gameRelationFile.relations.length,
    seriesFranchiseRelations: seriesRelationFile.relations.length,
    entityRelationships: relationshipFile.relationships.length,
    ambiguousLegacySeries: ambiguousClassificationRows.length,
    catalogEntriesWithMultipleFranchises: catalogIdsWithMultipleFranchises.length,
  },
  checks,
  failures,
  promotions: promotionRows,
  diagnostics: {
    seriesPropagationFailures,
    duplicateGameMemberships,
    duplicateSeriesMemberships,
    multiplePrimarySeries,
    multiplePrimaryGames,
    orphanGameRelationIds: orphanGameRelations.map((relation) => relation.gameId),
    orphanFranchiseRelationIds: [...new Set(orphanFranchiseRelations)].sort(),
    orphanSeriesRelationSlugs: [...new Set(orphanSeriesRelations)].sort(),
    ambiguousLegacyChanges,
    protectedFileMismatches,
  },
  legacyUrlOutcomes,
};

const markdown = `# Verificación pre/post de franquicias y sagas\n\n` +
  `Base: \`${snapshot.baselineRevision}\`.\n\n` +
  `## Invariantes\n\n` +
  Object.entries(checks).map(([name, passed]) => `- ${passed ? "PASS" : "FAIL"}: \`${name}\``).join("\n") +
  `\n\n## Conteos\n\n` +
  `- Fichas: ${snapshot.counts.catalogEntries.toLocaleString("es-ES")} antes / ${catalog.length.toLocaleString("es-ES")} después; ${catalogIdSet.size.toLocaleString("es-ES")} IDs únicos.\n` +
  `- Compañías: ${snapshot.counts.companies.toLocaleString("es-ES")} antes / ${companySlugs.length.toLocaleString("es-ES")} después.\n` +
  `- URLs legacy: ${legacyUrlOutcomes.length.toLocaleString("es-ES")}; ${redirectFile.redirects.length} redirects permanentes y ${legacyUrlOutcomes.length - redirectFile.redirects.length} páginas conservadas.\n` +
  `- Franquicias: ${Object.keys(franchiseFile.entities).length}; relaciones ficha-franquicia: ${gameRelationFile.relations.length}; relaciones saga-franquicia: ${seriesRelationFile.relations.length}.\n` +
  `- Clasificación conservadora: ${promotedClassificationSlugs.length} promociones, ${retainedClassificationSlugs.length} sagas y ${ambiguousClassificationRows.length} entradas legacy ambiguas intactas.\n\n` +
  `## Promociones\n\n` +
  promotionRows.map((row) =>
    `- ${row.slug}: ${row.legacyCatalogEntries} → ${row.franchiseCatalogEntries} fichas; membresía ${row.membershipParity ? "PASS" : "FAIL"}; editorial ${row.editorialPreserved ? "PASS" : "FAIL"}; redirect ${row.redirect ? "PASS" : "FAIL"}.`,
  ).join("\n") +
  `\n\n## Identificadores y rollback\n\n` +
  `El campo persistido \`gameId\` significa \`catalog_id\`: identifica una ficha/edición ya existente, no una obra lógica nueva. El rollback descarta el estado de franquicias y vuelve al lector legacy conservado; los hashes de catálogo, precios, créditos, compañías, series y contenido editorial se verifican contra la base \`${snapshot.baselineRevision}\`.\n\n` +
  `Los resultados HTTP, canonical, sitemap y QA visual se validan adicionalmente contra Preview; este informe verifica el estado de datos y el contrato de rutas esperado.\n`;

writeOrCheck(JSON_OUTPUT, report);
writeOrCheck(MARKDOWN_OUTPUT, markdown);

console.log(JSON.stringify({ mode: checkOnly ? "check" : "write", checks, failures, counts: report.counts }, null, 2));
if (failures.length > 0) process.exitCode = 1;
