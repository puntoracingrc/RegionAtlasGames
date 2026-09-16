import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const directFiles = [
  "data/catalog.json",
  "data/catalog-owned-scans.json",
  "data/catalog-id-aliases.json",
  "data/catalog-route-redirects.json",
  "data/game-search-aliases.json",
  "data/scanner-title-aliases.json",
  "data/price-history.json",
  "data/price-source-weights.json",
  "data/price-sync-batches.json",
  "data/price-sync-state.json",
  "data/provisional-price-seeds.json",
];

async function filesUnder(directory: string): Promise<string[]> {
  const rows = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const nested = await Promise.all(rows.map(async (row) => {
    const target = path.join(directory, row.name);
    return row.isDirectory() ? filesUnder(target) : [target];
  }));
  return nested.flat();
}

export async function researchCatalogProtectedFiles(rootDir = process.cwd()): Promise<string[]> {
  const dataDirectory = path.join(rootDir, "data");
  const dataFiles = await readdir(dataDirectory).catch(() => []);
  const editionGuides = dataFiles
    .filter((name) => /^catalog-edition-guides.*\.json$/.test(name))
    .map((name) => path.join(dataDirectory, name));
  const recursive = await Promise.all([
    filesUnder(path.join(dataDirectory, "provisional-price-seeds")),
    filesUnder(path.join(dataDirectory, "import-aliases")),
  ]);
  return [...new Set([
    ...directFiles.map((file) => path.join(rootDir, file)),
    ...editionGuides,
    ...recursive.flat(),
  ])].sort();
}

export async function hashResearchCatalogBoundary(rootDir = process.cwd()): Promise<{
  algorithm: "sha256";
  digest: string;
  files: Array<{ path: string; sha256: string }>;
}> {
  const files = [];
  for (const filename of await researchCatalogProtectedFiles(rootDir)) {
    try {
      const content = await readFile(filename);
      files.push({ path: path.relative(rootDir, filename), sha256: createHash("sha256").update(content).digest("hex") });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const digest = createHash("sha256").update(files.map((file) => `${file.path}\0${file.sha256}`).join("\n")).digest("hex");
  return { algorithm: "sha256", digest, files };
}

export function compareResearchCatalogBoundary(
  before: Awaited<ReturnType<typeof hashResearchCatalogBoundary>>,
  after: Awaited<ReturnType<typeof hashResearchCatalogBoundary>>,
): { identical: boolean; changed: string[] } {
  const previous = new Map(before.files.map((file) => [file.path, file.sha256]));
  const current = new Map(after.files.map((file) => [file.path, file.sha256]));
  const changed = [...new Set([...previous.keys(), ...current.keys()])]
    .filter((file) => previous.get(file) !== current.get(file))
    .sort();
  return { identical: before.digest === after.digest && changed.length === 0, changed };
}
