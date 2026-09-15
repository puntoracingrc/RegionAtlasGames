import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { platforms, publicListedCatalog } from "../src/lib/catalog";
import { encodeCatalogBrowseGame, catalogBrowseFingerprint } from "../src/lib/catalog-browse-index-codec";
import { toCatalogListGame } from "../src/lib/catalog-list-game";
import { groupCatalogListGames, catalogPhysicalFilterOptions } from "../src/lib/catalog-physical-edition-browse";
import { isDefaultCatalogGame } from "../src/lib/catalog-review-policy";
import {
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicSubgenreFilterOptions,
} from "../src/lib/catalog-filters";
import {
  publicCatalogRegionFilterOptions,
  publicCatalogRegionFilterOptionsByPlatform,
  publicCompanyFilterOptions,
  publicPlatformFilterOptions,
} from "../src/lib/public-catalog-filter-options";
import { getCompanyExplorerData } from "../src/lib/company-index";

const INDEX_VERSION = 2;
const outputDir = path.join(process.cwd(), "data", "index");
const mode = process.argv.includes("--check")
  ? "check"
  : process.argv.includes("--write")
    ? "write"
    : "inspect";

function portableGzip(payload: unknown): { serialized: Buffer; compressed: Buffer } {
  const serialized = Buffer.from(`${JSON.stringify(payload)}\n`);
  const compressed = gzipSync(serialized, { level: 9 });
  // RFC 1952 byte 9 identifies the compressor OS; keep Git artifacts portable.
  compressed[9] = 0xff;
  return { serialized, compressed };
}

function emit(name: string, payload: unknown): boolean {
  const outputPath = path.join(outputDir, name);
  const { serialized, compressed } = portableGzip(payload);
  const existing = existsSync(outputPath) ? readFileSync(outputPath) : null;
  let current = false;
  if (existing?.[9] === 0xff) {
    try {
      current = gunzipSync(existing).equals(serialized);
    } catch {
      current = false;
    }
  }

  if (mode === "write" && !current) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, compressed);
  }
  const status = current ? "actual" : mode === "write" ? "escrito" : "desactualizado";
  console.log(`${name}: ${status} · ${serialized.length.toLocaleString("es-ES")} B -> ${compressed.length.toLocaleString("es-ES")} B`);
  return current || mode === "write";
}

console.log("Preparando filas públicas enriquecidas…");
const groupedGames = groupCatalogListGames(publicListedCatalog.map(toCatalogListGame));
const fingerprints = Object.fromEntries(
  publicListedCatalog.map((game) => [game.id, catalogBrowseFingerprint(game)]),
);

const catalogOk = emit("catalog-browse-index.json.gz", {
  version: INDEX_VERSION,
  catalogCount: publicListedCatalog.filter(isDefaultCatalogGame).length,
  groupedCount: groupedGames.length,
  fingerprints,
  games: groupedGames.map(encodeCatalogBrowseGame),
  filterOptions: {
    regions: publicCatalogRegionFilterOptions(),
    regionsByPlatform: publicCatalogRegionFilterOptionsByPlatform(),
    platforms: publicPlatformFilterOptions(),
    companies: publicCompanyFilterOptions(),
    genres: publicGenreFilterOptions(),
    subgenres: publicSubgenreFilterOptions(),
    facets: publicFacetFilterOptions(),
    physicalEditions: catalogPhysicalFilterOptions(),
  },
});

const platformNames = new Map(platforms.map((platform) => [
  platform.slug,
  platform.shortName || platform.name,
]));
const lookupOk = emit("catalog-card-lookup.json.gz", {
  version: INDEX_VERSION,
  games: publicListedCatalog.map((game) => [
    game.id,
    game.slug,
    game.title,
    game.platformSlug,
    platformNames.get(game.platformSlug) ?? game.platformSlug.toUpperCase(),
    game.region,
    game.canonicalSeoSlug ?? null,
    game.coverUrl ?? null,
  ]),
});

console.log("Preparando índice público de compañías…");
const companiesOk = emit("company-browse-index.json.gz", {
  version: INDEX_VERSION,
  data: getCompanyExplorerData(),
});

if (mode === "check" && (!catalogOk || !lookupOk || !companiesOk)) process.exitCode = 1;
