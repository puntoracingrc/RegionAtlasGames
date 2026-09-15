import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { publicListedCatalog } from "../src/lib/catalog";
import { toCatalogListGame } from "../src/lib/catalog-list-game";
import {
  catalogGameSearchTextBase,
  toCatalogQuickSearchGame,
} from "../src/lib/catalog-quick-search-game";

const INDEX_VERSION = 1;
const outputPath = path.join(process.cwd(), "data", "index", "catalog-editorial-filter-index.json.gz");

type EditorialFilterRecord = [
  year: number | null,
  companySearchText: string,
  companies: string[],
  sortGenre: string | null,
  sortReference: string | null,
  genreSlugs: string[],
  subgenreSlugs: string[],
  facetSlugs: string[],
  searchTextAdditions: string,
  gameSearchTextAdditions: string,
];

function extraSearchTerms(fullText = "", baseText = ""): string {
  const baseTokens = new Set(baseText.split(" ").filter(Boolean));
  return [...new Set(fullText.split(" ").filter((token) => token && !baseTokens.has(token)))].join(" ");
}

function hasEditorialMetadata(record: EditorialFilterRecord): boolean {
  return record[0] != null ||
    Boolean(record[1]) ||
    record[2].length > 0 ||
    record[3] != null ||
    record[4] != null ||
    record[5].length > 0 ||
    record[6].length > 0 ||
    record[7].length > 0 ||
    Boolean(record[8]) ||
    Boolean(record[9]);
}

function buildPayload() {
  const records: Record<string, EditorialFilterRecord> = {};

  for (const game of publicListedCatalog) {
    const rich = toCatalogListGame(game);
    const quick = toCatalogQuickSearchGame(game);
    const defaultReference = game.slug || game.id;
    const record: EditorialFilterRecord = [
      rich.displayYear,
      rich.companySearchText ?? "",
      rich.companies ?? [],
      rich.sortGenre && rich.sortGenre !== "\uffff" ? rich.sortGenre : null,
      rich.sortReference && rich.sortReference !== defaultReference ? rich.sortReference : null,
      rich.genreSlugs ?? [],
      rich.subgenreSlugs ?? [],
      rich.facetSlugs ?? [],
      extraSearchTerms(rich.searchText, quick.searchText),
      extraSearchTerms(rich.gameSearchText, catalogGameSearchTextBase(game)),
    ];
    if (hasEditorialMetadata(record)) records[game.id] = record;
  }

  return {
    version: INDEX_VERSION,
    catalogCount: publicListedCatalog.length,
    recordCount: Object.keys(records).length,
    records,
  };
}

const payload = buildPayload();
const serialized = Buffer.from(`${JSON.stringify(payload)}\n`);
const output = gzipSync(serialized, { level: 9 });
// RFC 1952 byte 9 identifies the compressor OS; keep the artifact portable.
output[9] = 0xff;
const existing = existsSync(outputPath) ? readFileSync(outputPath) : null;
let current = false;
if (existing?.[9] === 0xff) {
  try {
    current = gunzipSync(existing).equals(serialized);
  } catch {
    current = false;
  }
}
const mode = process.argv.includes("--check") ? "check" : process.argv.includes("--write") ? "write" : "inspect";

if (mode === "check" && !current) {
  console.error(`Índice editorial desactualizado: ${path.relative(process.cwd(), outputPath)}`);
  process.exitCode = 1;
} else if (mode === "write" && !current) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
}

console.log(JSON.stringify({
  output: path.relative(process.cwd(), outputPath),
  catalogCount: payload.catalogCount,
  recordCount: payload.recordCount,
  compressedBytes: output.length,
  current: mode === "write" ? true : current,
  mode,
}, null, 2));
