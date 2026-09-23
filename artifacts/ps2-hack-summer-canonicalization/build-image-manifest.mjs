import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const sourceManifestPath = "/Users/macbookpro14/Downloads/assets_manifest.json";
const source = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
const outputRoot = join(import.meta.dirname, "images");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const entries = [];

for (const product of source.assets) {
  for (const [placement, originalPath] of Object.entries(product.repoAssets ?? {})) {
    if (typeof originalPath !== "string") continue;
    const original = join(repoRoot, originalPath);
    const name = basename(originalPath);
    const category = product.work === "_summer##"
      ? "_summer"
      : product.work.includes(" x ")
        ? "hack-compilations"
        : "hack-original";
    const firstPrefix = product.serials[0]?.split("-")[0] ?? "";
    const serial = product.serials
      .map((value, index) => index > 0 && value.startsWith(`${firstPrefix}-`)
        ? value.slice(firstPrefix.length + 1)
        : value)
      .join("-")
      .toLowerCase();
    const copiedName = `${serial}__${product.market.toLowerCase()}__${product.barcode}__${placement}.jpg`;
    const copied = join(outputRoot, category, copiedName);
    entries.push({
      work: product.work,
      family: product.family,
      serials: product.serials,
      barcode: product.barcode,
      market: product.market,
      placement,
      sourcePage: product.sourcePages?.[0] ?? null,
      repoOriginalPath: originalPath,
      copiedPath: copied.replace(`${repoRoot}/`, ""),
      sha256: sha256(original),
      copySha256: sha256(copied),
      status: "REPO_SOURCE_MATCHED",
      note: "Identidad declarada por el manifest de investigación; pendiente de vinculación pública a la ficha exacta.",
    });
  }
}

const palDirectory = join(outputRoot, "hack-original/infection-pal-unassigned");
for (const filename of readdirSync(palDirectory).sort()) {
  if (!filename.endsWith(".jpg")) continue;
  const copied = join(palDirectory, filename);
  entries.push({
    work: ".hack//Infection Part 1",
    family: "Standard",
    serials: ["SLES-52237"],
    barcode: null,
    market: null,
    placement: "front",
    sourcePage: null,
    repoOriginalPath: `artifacts/ps2-region-migration/original-covers/pal/${filename}`,
    copiedPath: copied.replace(`${repoRoot}/`, ""),
    sha256: sha256(copied),
    copySha256: sha256(copied),
    status: "PENDING_REVIEW",
    note: "Portada PAL sin EAN asignado; no publicar como país específico.",
  });
}

const pendingProducts = source.assets
  .filter((product) => product.status !== "repo_exact")
  .map(({ work, family, market, serials, barcode, status, sourcePages }) => ({
    work, family, market, serials, barcode, sourceStatus: status,
    sourcePages: sourcePages ?? [],
    status: "PENDING_REVIEW",
  }));

writeFileSync(join(import.meta.dirname, "image-manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceManifest: "regionatlas_ps2_hack_summer_codex_pack (1).zip/assets_manifest.json",
  entries,
  pendingProducts,
}, null, 2)}\n`);
