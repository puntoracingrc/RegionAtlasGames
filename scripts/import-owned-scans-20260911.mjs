import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Closed set of final, already redacted scanner outputs. No directory traversal
// or globbing: private captures must never enter the public asset pipeline.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Pass the scanner's final-asset manifest JSON.");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const extraManifestPath = process.argv[3];
if (!extraManifestPath) throw new Error("Pass the Assassin's Creed Mirage final-asset manifest JSON.");
const extraManifest = JSON.parse(await readFile(extraManifestPath, "utf8"));
const finalAssets = [...manifest.finalAssets, ...extraManifest.assets.map(asset => ({ ...asset, redactedCodes: 0 }))];
const specs = [
  { id: "ps4-fortnite", platform: "ps4", slug: "fortnite", title: "Fortnite", serial: "CUSA-07669", ean: "4020628781279", primaryCaption: "Carátula escaneada · PAL España", software: { text: ["Español", "Italiano"], audio: ["Inglés"] }, sources: [
    { hash: "078b584a4929ca09ce88eb99d5dcd53ea31ac5f64221edf2dd0730e4415dfe4d", pieces: [
      ["portada", "Portada", [3295, 0, 3081, 3744]],
      ["contraportada", "Contraportada", [0, 0, 2970, 3744]],
      ["lomo", "Lomo", [2970, 0, 325, 3744]],
      ["caratula-completa", "Carátula completa", null],
    ] },
    { hash: "bfe31e5fa0502a0e36f62dbdb30aab4e32317569c47e9498f0d14a50883899d2", pieces: [["folletos-anversos", "Folletos: Maestro de Tormenta y Acceso Anticipado · Anversos", null]] },
    { hash: "d6e3e1e5ac2a6ded4b722e0487b1ee6ee2be1cbf0741422439176212ed668ad6", pieces: [["folletos-reversos", "Folletos: Maestro de Tormenta y Acceso Anticipado · Reversos", null]] },
  ] },
  { id: "ps5-resident-evil-requiem-lenticular-cover", platform: "ps5", slug: "resident-evil-requiem-lenticular-cover", title: "Resident Evil Requiem [Lenticular Cover]", serial: "PPSA-31246", ean: "5055060993637", primaryCaption: "Carátula de papel · Edición lenticular PAL España", sources: [
    { hash: "c7ca6f9dee3042577520693a057189b9284244f942424816d8719521ed5a9fd5", pieces: [
      ["portada", "Portada de papel de la edición lenticular", [3355, 25, 3038, 3786]],
      ["contraportada", "Contraportada", [0, 25, 3020, 3786]],
      ["lomo", "Lomo", [3020, 25, 335, 3786]],
      ["caratula-completa", "Carátula de papel completa", null],
    ] },
    { hash: "109f03f43e2e14fc0382cb0fd412eebe42b109ffa7feb6e832cbc65f4e62304a", pieces: [
      ["lenticular", "Lámina lenticular · Ángulo capturado por el escáner", [3208, 147, 3192, 4014]],
      ["caja-y-lenticular", "Caja y lámina lenticular del mismo ejemplar", null],
    ] },
    { hash: "8adc75bafaf4ce2fcae472774108bc26e09754e2b5ffe2fc361af0a4d3f41af3", pieces: [["folleto-grace-apocalipsis", "Folleto del atuendo de Grace: Apocalipsis · Cara capturada", null]] },
  ] },
  { id: "ps4-assassins-creed-mirage-deluxe-edition", platform: "ps4", slug: "assassins-creed-mirage-deluxe-edition", title: "Assassins Creed Mirage Deluxe Edition", serial: null, productNumber: "300128688", ean: "3307216257806", packagingLanguages: ["Español"], languageStatement: "Juego en castellano", marketEvidence: "Edición PAL España confirmada por el propietario; portada y contraportada en español, con el rótulo «Juego en castellano».", primaryCaption: "Ejemplar precintado · Deluxe Edition PAL España", notes: ["Escaneo del ejemplar precintado: se conservan la caja, los reflejos y las marcas del plástico.", "La contraportada anuncia el Pack Deluxe inspirado en Prince of Persia y un libro de arte y banda sonora digitales. No se ha abierto la caja ni se han escaneado sus materiales interiores."], sources: [
    { hash: "b6e94b9f66963a02603312cd9bebe81c7cd1906c387f863a76193830b986a6f1", pieces: [["portada", "Portada del ejemplar precintado · Deluxe Edition", null]] },
    { hash: "2c656ac36ffc068b66e797b0e20a56ecd375aab81deed698c496f77c62a25a49", pieces: [["contraportada", "Contraportada del ejemplar precintado", null]] },
  ] },
];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const publicRegistry = { schemaVersion: 1, games: {} };
const evidence = { schemaVersion: 1, capturedAt: "2026-09-11", scanner: "EPSON ET-8500", sourceDpi: 600, processing: "Recorte rectangular, reducción y WebP; sin generación ni reconstrucción de imagen. Los códigos ya estaban ocultos en los PNG finales del escáner.", sources: [], assets: [], covers: [] };
for (const spec of specs) {
  const base = `/catalog-covers/${spec.platform}/escaneos-propios/${spec.slug}`;
  const folder = path.join(root, "public", base);
  await mkdir(folder, { recursive: true });
  const images = [];
  for (const source of spec.sources) {
    const approved = finalAssets.find(asset => asset.sha256 === source.hash);
    if (!approved || /\/(privados|originales)\//.test(approved.path)) throw new Error("Unapproved source");
    const bytes = await readFile(approved.path);
    if (sha(bytes) !== source.hash) throw new Error(`Source changed: ${approved.path}`);
    evidence.sources.push({ fileName: path.basename(approved.path), sha256: source.hash, width: approved.width, height: approved.height, redactedCodes: approved.redactedCodes });
    for (const [kind, label, crop] of source.pieces) {
      const pipe = () => {
        let input = sharp(bytes);
        if (crop) input = input.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });
        return input;
      };
      const name = `${spec.slug}-${kind}`;
      const full = await pipe().resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 6 }).toBuffer({ resolveWithObject: true });
      const thumb = await pipe().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 84, effort: 6 }).toBuffer();
      await writeFile(path.join(folder, `${name}.webp`), full.data);
      await writeFile(path.join(folder, `${name}-mini.webp`), thumb);
      if (kind === "portada") {
        const cover = await pipe().resize({ height: 1400, withoutEnlargement: true }).webp({ quality: 88, effort: 6 }).toBuffer();
        await writeFile(path.join(folder, `${name}-catalogo.webp`), cover);
        evidence.covers.push({ catalogId: spec.id, url: `${base}/${name}-catalogo.webp`, sourceSha256: source.hash, crop, sha256: sha(cover), bytes: cover.length });
      }
      const image = { role: kind, label, url: `${base}/${name}.webp`, thumbnailUrl: `${base}/${name}-mini.webp`, width: full.info.width, height: full.info.height, ...(approved.redactedCodes ? { redactedCodes: approved.redactedCodes } : {}) };
      images.push(image);
      evidence.assets.push({ catalogId: spec.id, ...image, sourceSha256: source.hash, crop, sha256: sha(full.data), bytes: full.data.length, thumbnailSha256: sha(thumb), thumbnailBytes: thumb.length });
    }
  }
  publicRegistry.games[spec.id] = {
    identity: { platformSlug: spec.platform, slug: spec.slug, region: "PAL España", edition: "standard" },
    capturedAt: "2026-09-11", sourceLabel: "Escaneos aportados por el propietario del ejemplar", primaryCoverUrl: evidence.covers.find(cover => cover.catalogId === spec.id).url, primaryCaption: spec.primaryCaption,
    packaging: { reference: spec.serial, ean: spec.ean, languages: spec.packagingLanguages ?? ["Español", "Italiano"], marketEvidence: spec.marketEvidence ?? "Edición PAL España confirmada por el propietario; contraportada con textos en español e italiano.", ...(spec.productNumber ? { productNumber: spec.productNumber } : {}), ...(spec.languageStatement ? { languageStatement: spec.languageStatement } : {}) },
    ...(spec.software ? { softwareLanguagesPrinted: spec.software } : {}),
    notes: spec.notes ?? (spec.platform === "ps4" ? ["Los dos folletos escaneados corresponden al Pack de armas Maestro de Tormenta y al Paquete de Acceso Anticipado."] : ["La portada principal muestra la carátula de papel del ejemplar lenticular. La galería incluye la lámina lenticular por separado.", "La lámina lenticular cambia según el ángulo; el escaneo conserva la trama y el aspecto más oscuro de esta captura."]),
    images,
  };
}
await writeFile(path.join(root, "data/catalog-owned-scans.json"), `${JSON.stringify(publicRegistry, null, 2)}\n`);
await writeFile(path.join(root, "data/research/owned-scans/2026-09-11-assets.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ games: Object.keys(publicRegistry.games), images: evidence.assets.length, bytes: evidence.assets.reduce((sum, asset) => sum + asset.bytes + asset.thumbnailBytes, 0) }));
