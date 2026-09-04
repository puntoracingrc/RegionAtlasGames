import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildCatalogSeoSlug } from "../src/lib/catalog-path";

type Classification = "franchise" | "series" | "ambiguous";
type Confidence = "high" | "medium" | "low";

type SeriesEntry = {
  name: string;
  slug: string;
  museumPath?: string;
  gameIds: string[];
  byPlatform?: Record<string, number>;
  gameCount?: number;
  description?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number | null;
  backgroundReadability?: string | null;
  active?: boolean;
};

type OverlayEntry = Partial<SeriesEntry> & {
  additions?: string[];
  removals?: string[];
};

type SeriesOverlay = {
  updatedAt?: string;
  source?: string;
  series?: Record<string, OverlayEntry>;
};

type CatalogGame = {
  id: string;
  slug: string;
  title: string;
  platformSlug: string;
  region: string;
  listingStatus: string;
};

type DetailEntity = { name?: string; slug?: string };
type GameDetails = {
  series?: DetailEntity | null;
  developer?: DetailEntity | null;
  publisher?: DetailEntity | null;
};

type ClassificationDecision = {
  classification: Classification;
  targetFranchise?: string;
  franchises?: string[];
  primaryFranchise?: string;
  confidence: Confidence;
  notes: string;
};

type OverrideFile = {
  schemaVersion: number;
  reviewedAt: string;
  source: string;
  additionalFranchises: Array<{
    id: string;
    slug: string;
    name: string;
    status: "draft" | "published";
    confidence: Confidence;
    notes: string;
  }>;
  decisions: Record<string, ClassificationDecision>;
};

const ROOT = process.cwd();
const BASELINE_REVISION = "8a1b296359ed2108590067602e5c8d2442e57031";
const OUTPUT_DIR = path.join(ROOT, "data", "migrations", "franchise-series-v1");
const DOC_FILE = path.join(ROOT, "docs", "research", "franchise-series-migration-phase-0-2026-09-04.md");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const overlayArg = process.argv.find((arg) => arg.startsWith("--series-overlay="));
const bundledOverlayPath = path.join(OUTPUT_DIR, "production-series-overlay-effective.json");
const overlayPath = overlayArg?.slice("--series-overlay=".length) ??
  (existsSync(bundledOverlayPath) ? bundledOverlayPath : undefined);

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function effectiveSeries(
  staticSeries: Record<string, SeriesEntry>,
  overlay: SeriesOverlay,
): Record<string, SeriesEntry> {
  const result: Record<string, SeriesEntry> = {};
  const slugs = unique([...Object.keys(staticSeries), ...Object.keys(overlay.series ?? {})]).sort();
  for (const slug of slugs) {
    const base = staticSeries[slug];
    const patch = overlay.series?.[slug];
    if (!base && !patch) continue;
    const removals = new Set(patch?.removals ?? []);
    const baseGameIds = overlay.source === "production-admin-api-read-only" && patch?.gameIds
      ? patch.gameIds
      : base?.gameIds ?? patch?.gameIds ?? [];
    const gameIds = unique([...baseGameIds, ...(patch?.additions ?? [])])
      .filter((id) => !removals.has(id));
    result[slug] = {
      name: patch?.name ?? base?.name ?? slug,
      slug,
      museumPath: base?.museumPath ?? `/saga/${slug}`,
      gameIds,
      byPlatform: base?.byPlatform ?? {},
      gameCount: gameIds.length,
      description: patch?.description ?? base?.description ?? null,
      backgroundImageUrl: patch?.backgroundImageUrl ?? base?.backgroundImageUrl ?? null,
      backgroundImageOpacity: patch?.backgroundImageOpacity ?? base?.backgroundImageOpacity ?? null,
      backgroundReadability: patch?.backgroundReadability ?? base?.backgroundReadability ?? null,
      active: patch?.active ?? base?.active ?? true,
    };
  }
  return result;
}

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".json", ".md", ".sh"]);
const SKIP_DIRS = new Set([".git", ".next", "node_modules", "public", "catalog-detail-by-id", "migrations"]);
const consumerPatterns = [
  { id: "route-saga", regex: /\/saga(?:\/|\b)/g },
  { id: "series-id", regex: /\bseriesIds?\b/g },
  { id: "details-series", regex: /details(?:\?\.)?\.series\b/g },
  { id: "series-field", regex: /["']series["']\s*:/g },
  { id: "series-symbol", regex: /\b(?:get|list|build|admin|public)[A-Za-z]*Series[A-Za-z]*\b/g },
  { id: "saga-copy", regex: /\b(?:Saga|Sagas|saga|sagas)\b/g },
];

function listFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (SKIP_DIRS.has(entry)) continue;
    const absolute = path.join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...listFiles(absolute));
    else if (TEXT_EXTENSIONS.has(path.extname(entry))) files.push(absolute);
  }
  return files;
}

function buildConsumerAudit() {
  const roots = ["src", "scripts"]
    .map((dir) => path.join(ROOT, dir))
    .filter(existsSync);
  const matches: Array<{ file: string; line: number; patterns: string[]; text: string }> = [];
  for (const file of roots.flatMap(listFiles).sort()) {
    const relative = path.relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const patternIds = consumerPatterns
        .filter(({ regex }) => {
          regex.lastIndex = 0;
          return regex.test(line);
        })
        .map(({ id }) => id);
      if (patternIds.length > 0) {
        matches.push({ file: relative, line: index + 1, patterns: patternIds, text: line.trim().slice(0, 240) });
      }
    });
  }
  const files = unique(matches.map((match) => match.file));
  const dataSurfaces = ["data", "docs"]
    .map((dir) => path.join(ROOT, dir))
    .filter(existsSync)
    .flatMap(listFiles)
    .sort()
    .map((file) => {
      const content = readFileSync(file, "utf8");
      const patterns = consumerPatterns
        .map(({ id, regex }) => {
          regex.lastIndex = 0;
          return { id, count: [...content.matchAll(regex)].length };
        })
        .filter(({ count }) => count > 0);
      return { file: path.relative(ROOT, file), patterns };
    })
    .filter(({ patterns }) => patterns.length > 0);
  return {
    schemaVersion: 1,
    baselineRevision: BASELINE_REVISION,
    scannedRoots: roots.map((root) => path.relative(ROOT, root)),
    matchCount: matches.length,
    fileCount: files.length,
    files,
    matches,
    dataSurfaces,
  };
}

function deriveCompanies(gameIds: string[], details: Record<string, GameDetails>) {
  const companies = new Map<string, string>();
  for (const gameId of gameIds) {
    for (const entity of [details[gameId]?.developer, details[gameId]?.publisher]) {
      if (!entity?.slug) continue;
      companies.set(entity.slug, entity.name ?? entity.slug);
    }
  }
  return [...companies.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function derivePlatforms(gameIds: string[], catalogById: Map<string, CatalogGame>) {
  const counts = new Map<string, number>();
  for (const gameId of gameIds) {
    const platform = catalogById.get(gameId)?.platformSlug;
    if (platform) counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function writeOrCheck(filePath: string, value: unknown) {
  const next = typeof value === "string" ? value : stableJson(value);
  if (checkOnly) {
    const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    if (current !== next) throw new Error(`Artifact out of date: ${path.relative(ROOT, filePath)}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, next, "utf8");
}

function writeOrCheckGzip(filePath: string, value: unknown) {
  const next = gzipSync(Buffer.from(stableJson(value)), { level: 9 });
  if (checkOnly) {
    const current = existsSync(filePath) ? readFileSync(filePath) : Buffer.alloc(0);
    if (!current.equals(next)) throw new Error(`Artifact out of date: ${path.relative(ROOT, filePath)}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, next);
}

const catalog = readJson<CatalogGame[]>(path.join(ROOT, "data", "catalog.json"));
const details = readJson<Record<string, GameDetails>>(path.join(ROOT, "data", "game-details.json"));
const staticSeries = readJson<Record<string, SeriesEntry>>(path.join(ROOT, "data", "index", "series.json"));
const overrides = readJson<OverrideFile>(path.join(ROOT, "data", "franchise-system", "classification-overrides.json"));
const overlay = overlayPath && existsSync(overlayPath) ? readJson<SeriesOverlay>(overlayPath) : { series: {} };
const series = effectiveSeries(staticSeries, overlay);
const catalogById = new Map(catalog.map((game) => [game.id, game]));

const classification = Object.fromEntries(
  Object.values(series)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => {
      const decision = overrides.decisions[entry.slug] ?? {
        classification: "ambiguous" as const,
        confidence: "low" as const,
        notes: "Sin evidencia manual suficiente; se conserva íntegramente en el lector legacy.",
      };
      return [entry.slug, {
        slug: entry.slug,
        name: entry.name,
        classification: decision.classification,
        gameCount: entry.gameIds.length,
        proposedFranchise: decision.targetFranchise ?? null,
        relatedFranchises: decision.franchises ?? [],
        primaryFranchise: decision.primaryFranchise ?? null,
        confidence: decision.confidence,
        source: overrides.decisions[entry.slug] ? overrides.source : "unreviewed",
        notes: decision.notes,
      }];
    }),
);

for (const slug of Object.keys(overrides.decisions)) {
  if (!series[slug]) throw new Error(`Classification override does not match a legacy series: ${slug}`);
}

const detailSeriesGameIds = Object.entries(details)
  .filter(([, detail]) => Boolean(detail?.series?.slug))
  .map(([gameId]) => gameId);
const indexedSeriesGameIds = unique(Object.values(series).flatMap((entry) => entry.gameIds));
const snapshotSeries = Object.fromEntries(
  Object.values(series)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => [entry.slug, {
      slug: entry.slug,
      name: entry.name,
      legacyIdentity: entry.slug,
      url: `/saga/${entry.slug}`,
      published: entry.active !== false,
      gameCount: entry.gameIds.length,
      gameIds: entry.gameIds,
      gameIdsSha256: sha256(entry.gameIds),
      platforms: derivePlatforms(entry.gameIds, catalogById),
      companies: deriveCompanies(entry.gameIds, details),
      editorial: {
        description: entry.description ?? null,
        backgroundImageUrl: entry.backgroundImageUrl ?? null,
        backgroundImageOpacity: entry.backgroundImageOpacity ?? null,
        backgroundReadability: entry.backgroundReadability ?? null,
        museumPath: entry.museumPath ?? null,
      },
    }]),
);

const catalogIdentity = catalog.map((game) => ({
  id: game.id,
  slug: game.slug,
  url: `/catalogo/${buildCatalogSeoSlug(game)}`,
  listingStatus: game.listingStatus,
}));
const companyIndex = readJson<Record<string, SeriesEntry>>(path.join(ROOT, "data", "index", "companies.json"));
const snapshot = {
  schemaVersion: 1,
  baselineRevision: BASELINE_REVISION,
  overlay: {
    included: Boolean(overlayPath && existsSync(overlayPath)),
    source: overlayPath ? path.basename(overlayPath) : null,
    updatedAt: overlay.updatedAt ?? null,
  },
  counts: {
    catalogGames: catalog.length,
    publicCatalogGames: catalog.filter((game) => game.listingStatus !== "excluded").length,
    companies: Object.keys(companyIndex).length,
    legacySeries: Object.keys(series).length,
    detailsWithSeries: detailSeriesGameIds.length,
    uniqueIndexedSeriesGames: indexedSeriesGameIds.length,
  },
  checksums: {
    catalogIdentitySha256: sha256(catalogIdentity),
    companyIdentitySha256: sha256(Object.keys(companyIndex).sort()),
    legacySeriesMembershipSha256: sha256(Object.fromEntries(
      Object.entries(snapshotSeries).map(([slug, value]) => [slug, value.gameIds]),
    )),
  },
  discrepancies: {
    detailSeriesGamesNotIndexed: detailSeriesGameIds.filter((id) => !indexedSeriesGameIds.includes(id)).sort(),
    indexedGamesMissingFromCatalog: indexedSeriesGameIds.filter((id) => !catalogById.has(id)).sort(),
  },
  catalogIdentity,
  companySlugs: Object.keys(companyIndex).sort(),
  series: snapshotSeries,
};

const dryRunRows = Object.values(classification);
const dryRun = {
  schemaVersion: 1,
  baselineRevision: BASELINE_REVISION,
  source: overrides.source,
  counts: {
    total: dryRunRows.length,
    franchise: dryRunRows.filter((row) => row.classification === "franchise").length,
    series: dryRunRows.filter((row) => row.classification === "series").length,
    ambiguous: dryRunRows.filter((row) => row.classification === "ambiguous").length,
    additionalFranchises: overrides.additionalFranchises.length,
  },
  additionalFranchises: overrides.additionalFranchises,
  rows: dryRunRows,
};

const consumerAudit = buildConsumerAudit();
const report = `# Migración franquicias/sagas — Fase 0\n\n` +
  `Base auditada: \`${BASELINE_REVISION}\`.\n\n` +
  `## Estado congelado\n\n` +
  `- ${snapshot.counts.catalogGames.toLocaleString("es-ES")} fichas de catálogo; ${snapshot.counts.publicCatalogGames.toLocaleString("es-ES")} no excluidas.\n` +
  `- ${snapshot.counts.companies.toLocaleString("es-ES")} compañías indexadas.\n` +
  `- ${snapshot.counts.legacySeries.toLocaleString("es-ES")} agrupaciones legacy.\n` +
  `- ${snapshot.counts.detailsWithSeries.toLocaleString("es-ES")} fichas declaran \`details.series\`; ${snapshot.counts.uniqueIndexedSeriesGames.toLocaleString("es-ES")} juegos únicos están en el índice efectivo.\n` +
  `- Overlay administrativo incluido: ${snapshot.overlay.included ? "sí" : "no; repetir con --series-overlay=<ruta> antes de aplicar datos en Production"}.\n\n` +
  `## Clasificación conservadora\n\n` +
  `- Franquicias seguras: ${dryRun.counts.franchise}.\n` +
  `- Sagas/subseries seguras: ${dryRun.counts.series}.\n` +
  `- Ambiguas, sin migración destructiva: ${dryRun.counts.ambiguous}.\n` +
  `- Franquicias nuevas sin redirect legacy: ${dryRun.counts.additionalFranchises}.\n\n` +
  `Las decisiones seguras proceden exclusivamente de los casos aprobados en la especificación. El resto permanece legacy; no se usa coincidencia de título como fuente de verdad.\n\n` +
  `## Consumidores\n\n` +
  `La búsqueda reproducible encontró ${consumerAudit.matchCount.toLocaleString("es-ES")} coincidencias en ${consumerAudit.fileCount.toLocaleString("es-ES")} archivos. El detalle exacto, con línea y patrón, está en \`consumer-audit.json\`.\n\n` +
  `## Bloqueos previos a escritura canónica\n\n` +
  `1. Incorporar el overlay administrativo de Production al snapshot final.\n` +
  `2. Mantener la discrepancia de \`details.series\` identificada y no ocultarla con la migración.\n` +
  `3. Demostrar por checksum que IDs, URLs y compañías no cambian.\n` +
  `4. Aplicar únicamente las decisiones \`high\`; todo \`ambiguous\` conserva su URL y membresía.\n`;

writeOrCheck(path.join(ROOT, "data", "franchise-system", "series-classification.json"), {
  schemaVersion: 1,
  baselineRevision: BASELINE_REVISION,
  source: overrides.source,
  entries: classification,
});
writeOrCheckGzip(path.join(OUTPUT_DIR, "pre-migration-snapshot.json.gz"), snapshot);
writeOrCheck(path.join(OUTPUT_DIR, "classification-dry-run.json"), dryRun);
writeOrCheck(path.join(OUTPUT_DIR, "consumer-audit.json"), consumerAudit);
writeOrCheck(DOC_FILE, report);

console.log(JSON.stringify({
  mode: checkOnly ? "check" : "write",
  baselineRevision: BASELINE_REVISION,
  series: snapshot.counts.legacySeries,
  classification: dryRun.counts,
  consumerFiles: consumerAudit.fileCount,
  discrepancies: snapshot.discrepancies,
}, null, 2));
