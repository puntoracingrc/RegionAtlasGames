import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const manifestPath = process.argv[2];
if (!manifestPath) throw Error("Provide the final scanner manifest");
const load = async file => JSON.parse(await readFile(file, "utf8"));
const write = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + "\n");
const manifest = await load(manifestPath);
const registry = await load("data/catalog-owned-scans.json");
const evidence = await load("data/research/owned-scans/2026-09-11-assets.json");
const id = "ps4-fornite-ps4-promo";
// Rebuild only this task's reviewed promo derivatives when the scanner adds the back.
const oldSourceHashes = new Set(evidence.assets.filter(asset => asset.catalogId === id).map(asset => asset.sourceSha256));
evidence.assets = evidence.assets.filter(asset => asset.catalogId !== id);
evidence.covers = evidence.covers.filter(asset => asset.catalogId !== id);
evidence.sources = evidence.sources.filter(source => !oldSourceHashes.has(source.sha256));
const approved = [
  ["conjunto", "Caja y disco promocional", "c0e66edc78cd053611bddfc386d17010bbd8ef5f175f4712d87cae7cacc7558c"],
  ["caja-portada", "Portada de la caja promocional", "6d805e0224a0980f6a2168f3badfb6b38826a1f9f78e2c372a8b81b25244ac3d"],
  ["disco-etiqueta", "Etiqueta del disco promocional", "52b07bb94fa569139774d83a689fad7b8d1301fa59718687d5be638ce118028d"],
  ["caja-con-disco-colocado", "Disco colocado en su caja · reverso parcialmente oculto", "e3dc7731bd4b5656ad6f126936532abc1751617c28f42727328b6c2671cb1497"],
  ["contraportada", "Contraportada promocional · códigos de canje ocultos", "0eb59ad52d78a37f8696ae1c4084927e61eff411dd5d943ed34e0c86c581b8b8"],
];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const base = "/catalog-covers/ps4/escaneos-propios/fortnite-promo-disc";
await mkdir(`public${base}`, { recursive: true });
const images = [];
let primaryCoverUrl;
for (const [role, label, hash] of approved) {
  const asset = manifest.finalAssets.find(asset => asset.sha256 === hash);
  if (!asset || !asset.path.includes("/para-compartir/")) throw Error("Missing approved public scan");
  const bytes = await readFile(asset.path);
  if (sha(bytes) !== hash) throw Error("Source hash mismatch");
  const input = sharp(bytes), meta = await input.metadata();
  const full = await input.clone().resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 6 }).toBuffer({ resolveWithObject: true });
  const thumb = await input.clone().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 84, effort: 6 }).toBuffer();
  const image = { role, label, url: `${base}/fortnite-promo-disc-${role}.webp`, thumbnailUrl: `${base}/fortnite-promo-disc-${role}-mini.webp`, width: full.info.width, height: full.info.height, ...(asset.redactedCodes ? {redactedCodes: asset.redactedCodes} : {}) };
  await writeFile(`public${image.url}`, full.data);
  await writeFile(`public${image.thumbnailUrl}`, thumb);
  evidence.sources.push({ fileName: path.basename(asset.path), sha256: hash, width: meta.width, height: meta.height, redactedCodes: asset.redactedCodes ?? 0 });
  evidence.assets.push({ catalogId: id, ...image, sourceSha256: hash, crop: null, sha256: sha(full.data), bytes: full.data.length, thumbnailSha256: sha(thumb), thumbnailBytes: thumb.length });
  images.push(image);
  if (role === "caja-portada") {
    const cover = await input.clone().resize({ height: 1400, withoutEnlargement: true }).webp({ quality: 88, effort: 6 }).toBuffer();
    primaryCoverUrl = `${base}/fortnite-promo-disc-portada-catalogo.webp`;
    await writeFile(`public${primaryCoverUrl}`, cover);
    evidence.covers.push({ catalogId: id, url: primaryCoverUrl, sourceSha256: hash, crop: null, sha256: sha(cover), bytes: cover.length });
  }
}
registry.games[id] = {
  identity: { platformSlug: "ps4", slug: "fornite-ps4-promo", region: "PAL · Mercado por determinar", edition: "promo" },
  supersededIdentity: { platformSlug: "ps4", slug: "fornite-ps4-promo", region: "PAL España", edition: "standard" },
  capturedAt: "2026-09-11", sourceLabel: "Escaneos aportados por el propietario del ejemplar",
  primaryCoverUrl, primaryCaption: "Caja del ejemplar promocional · país de distribución por determinar",
  packaging: {
    reference: "CUSA-07669", referenceComponent: "disco", ean: null,
    languages: ["Inglés", "Francés", "Alemán"], productNumber: "1022534INPRM",
    marketEvidence: "Ejemplar PAL según el propietario. La caja y el disco muestran PEGI 12 y USK 12; estas señales no bastan para asignar un país de distribución.",
    discIdentifiers: [{ label: "Número impreso del disco", value: "8781071" }, { label: "Código de producto del disco", value: "1022534LAPRM" }],
  },
  softwareLanguagesPrinted: {
    text: ["Inglés", "Francés", "Alemán", "Italiano", "Español", "Polaco", "Ruso", "Portugués (Brasil)"],
    audio: ["Inglés", "Francés", "Alemán", "Polaco", "Ruso"],
  },
  notes: [
    "El disco lleva «PROMO ONLY – NOT FOR RESALE» y «Ejemplar de promoción – Prohibida la venta» junto a otros idiomas. Es una variante promocional, diferenciada de la edición comercial aunque comparta CUSA-07669.",
    "Créditos impresos en el disco: desarrollo de Epic Games, publicación de Gearbox Publishing y distribución de Koch Media GmbH. «Made in Austria» indica fabricación, no mercado de venta.",
    "La contraportada despejada muestra «NOT FOR RESALE» y una tabla independiente de textos y voces. Los idiomas se transcriben de esa tabla, sin verificar el software ejecutándolo. Los dos códigos de canje se han ocultado antes de publicar.",
    "No se han verificado una tirada, un grado de rareza, una fecha específica de distribución ni un precinto para este ejemplar.",
  ], images,
};
await write("data/catalog-owned-scans.json", registry);
await write("data/research/owned-scans/2026-09-11-assets.json", evidence);
console.log(JSON.stringify({ id, images: images.length }));
