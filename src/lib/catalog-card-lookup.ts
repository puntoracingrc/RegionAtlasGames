import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const INDEX_VERSION = 2;
const INDEX_FILE = "catalog-card-lookup.json.gz";

export type CatalogCardLookupEntry = {
  id: string;
  slug: string;
  title: string;
  platformSlug: string;
  platformName: string;
  region: string;
  canonicalSeoSlug: string | null;
  coverUrl: string | null;
};

type CatalogCardTuple = [
  id: string,
  slug: string,
  title: string,
  platformSlug: string,
  platformName: string,
  region: string,
  canonicalSeoSlug: string | null,
  coverUrl: string | null,
];

type CatalogCardLookupPayload = {
  version: number;
  games: CatalogCardTuple[];
};

let cache: Map<string, CatalogCardLookupEntry> | null = null;

export function getCatalogCardLookup(): ReadonlyMap<string, CatalogCardLookupEntry> {
  if (cache) return cache;
  const compressed = readFileSync(path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "index",
    INDEX_FILE,
  ));
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8")) as CatalogCardLookupPayload;
  if (payload.version !== INDEX_VERSION || !Array.isArray(payload.games)) {
    throw new Error(`Índice de tarjetas incompatible: ${INDEX_FILE}`);
  }
  cache = new Map(payload.games.map((game) => [game[0], {
    id: game[0],
    slug: game[1],
    title: game[2],
    platformSlug: game[3],
    platformName: game[4],
    region: game[5],
    canonicalSeoSlug: game[6],
    coverUrl: game[7],
  }]));
  return cache;
}
