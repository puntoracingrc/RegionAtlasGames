import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { buildCatalogSeoSlug } from "../src/lib/catalog-path";
import type {
  FranchiseEntity,
  GameFranchiseRelation,
  LegacySeriesRedirect,
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
  gameCount: number;
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
  counts: { catalogGames: number; companies: number; legacySeries: number };
  checksums: {
    catalogIdentitySha256: string;
    companyIdentitySha256: string;
    legacySeriesMembershipSha256: string;
  };
  catalogIdentity: Array<{ id: string; slug: string; url: string; listingStatus: string }>;
  companySlugs: string[];
  series: Record<string, SnapshotSeries>;
};

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
const redirectFile = readJson<{ redirects: LegacySeriesRedirect[] }>("data/franchise-system/legacy-series-redirects.json");

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
const franchiseIdSet = new Set(Object.values(franchiseFile.entities).map((franchise) => franchise.id));
const redirectBySlug = new Map(redirectFile.redirects.map((redirect) => [redirect.legacySeriesSlug, redirect]));

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
      legacyGames: legacyGameIds.length,
      franchiseGames: directGameIds.length,
      lostGameIds: legacyGameIds.filter((id) => !directGameIds.includes(id)),
      unexpectedGameIds: directGameIds.filter((id) => !legacyGameIds.includes(id)),
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

const legacyUrlOutcomes = Object.keys(snapshot.series).sort().map((slug) => ({
  url: `/saga/${slug}`,
  outcome: redirectBySlug.has(slug) ? "permanent_redirect" : "200",
  destination: redirectBySlug.get(slug)?.destination ?? null,
}));

const checks = {
  catalogCount: catalog.length === snapshot.counts.catalogGames,
  catalogIdsAndOrder: sameArray(currentCatalogIds, baselineCatalogIds),
  catalogIdentityChecksum: sha256(catalogIdentity) === snapshot.checksums.catalogIdentitySha256,
  companyCount: companySlugs.length === snapshot.counts.companies,
  companyIdentityChecksum: sha256(companySlugs) === snapshot.checksums.companyIdentitySha256,
  promotionMembershipParity: promotionRows.every((row) => row.membershipParity),
  promotionEditorialPreserved: promotionRows.every((row) => row.editorialPreserved),
  promotionRedirects: promotionRows.every((row) => row.redirect),
  everyLegacyUrlHasOutcome: legacyUrlOutcomes.length === snapshot.counts.legacySeries &&
    legacyUrlOutcomes.every((row) => row.outcome === "200" || row.outcome === "permanent_redirect"),
  seriesPropagation: seriesPropagationFailures.length === 0,
  noDuplicateMemberships: duplicateGameMemberships.length === 0 && duplicateSeriesMemberships.length === 0,
  noMultiplePrimaryMemberships: multiplePrimarySeries.length === 0 && multiplePrimaryGames.length === 0,
  noOrphanRelations: orphanGameRelations.length === 0 && orphanFranchiseRelations.length === 0,
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  schemaVersion: 1,
  baselineRevision: snapshot.baselineRevision,
  counts: {
    catalogGamesBefore: snapshot.counts.catalogGames,
    catalogGamesAfter: catalog.length,
    companiesBefore: snapshot.counts.companies,
    companiesAfter: companySlugs.length,
    legacySeriesUrls: legacyUrlOutcomes.length,
    permanentRedirects: legacyUrlOutcomes.filter((row) => row.outcome === "permanent_redirect").length,
    retainedLegacyPages: legacyUrlOutcomes.filter((row) => row.outcome === "200").length,
    franchises: Object.keys(franchiseFile.entities).length,
    gameFranchiseRelations: gameRelationFile.relations.length,
    seriesFranchiseRelations: seriesRelationFile.relations.length,
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
  },
  legacyUrlOutcomes,
};

const markdown = `# Verificación pre/post de franquicias y sagas\n\n` +
  `Base: \`${snapshot.baselineRevision}\`.\n\n` +
  `## Invariantes\n\n` +
  Object.entries(checks).map(([name, passed]) => `- ${passed ? "PASS" : "FAIL"}: \`${name}\``).join("\n") +
  `\n\n## Conteos\n\n` +
  `- Juegos: ${snapshot.counts.catalogGames.toLocaleString("es-ES")} antes / ${catalog.length.toLocaleString("es-ES")} después.\n` +
  `- Compañías: ${snapshot.counts.companies.toLocaleString("es-ES")} antes / ${companySlugs.length.toLocaleString("es-ES")} después.\n` +
  `- URLs legacy: ${legacyUrlOutcomes.length.toLocaleString("es-ES")}; ${redirectFile.redirects.length} redirects permanentes y ${legacyUrlOutcomes.length - redirectFile.redirects.length} páginas conservadas.\n` +
  `- Franquicias: ${Object.keys(franchiseFile.entities).length}; relaciones game-franchise: ${gameRelationFile.relations.length}; relaciones series-franchise: ${seriesRelationFile.relations.length}.\n\n` +
  `## Promociones\n\n` +
  promotionRows.map((row) =>
    `- ${row.slug}: ${row.legacyGames} → ${row.franchiseGames}; membresía ${row.membershipParity ? "PASS" : "FAIL"}; editorial ${row.editorialPreserved ? "PASS" : "FAIL"}; redirect ${row.redirect ? "PASS" : "FAIL"}.`,
  ).join("\n") +
  `\n\nLos resultados HTTP, canonical, sitemap y QA visual se validan adicionalmente contra Preview; este informe verifica el estado de datos y el contrato de rutas esperado.\n`;

writeOrCheck(JSON_OUTPUT, report);
writeOrCheck(MARKDOWN_OUTPUT, markdown);

console.log(JSON.stringify({ mode: checkOnly ? "check" : "write", checks, failures, counts: report.counts }, null, 2));
if (failures.length > 0) process.exitCode = 1;
