import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [decisionPath, manifestPath] = process.argv.slice(2);
if (!decisionPath || !manifestPath) throw Error("Pass the reviewed decision JSON and final scanner manifest.");
const read = file => readFile(path.resolve(root, file), "utf8");
const load = async file => JSON.parse(await read(file));
const decisions = await load(decisionPath), manifest = await load(manifestPath);
const finalAssets = manifest.finalAssets ?? manifest.assets;
const registry = await load("data/catalog-owned-scans.json");
const evidence = await load("data/research/owned-scans/2026-09-11-assets.json");
const audit = await load("data/research/owned-scans/2026-09-11-integration.json");
let catalogText = await read("data/catalog.json"), detailsText = await read("data/game-details.json"), publicText = await read("public/catalog-details/ps4.json");
const catalog = JSON.parse(catalogText), details = JSON.parse(detailsText);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function replaceObject(text, key, value, compact = false) {
  const marker = JSON.stringify(key) + ":";
  let left = text.indexOf(marker);
  if (left < 0) throw Error(`Missing existing details row ${key}`);
  left += marker.length;
  while (/\s/.test(text[left])) left++;
  let depth = 0, quoted = false, escaped = false;
  for (let i = left; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) return text.slice(0, left) + (compact ? JSON.stringify(value) : JSON.stringify(value, null, 2).replace(/\n/g, "\n  ")) + text.slice(i + 1);
  }
  throw Error("Unclosed JSON object");
}
const applied = [];
for (const [id, decision] of Object.entries(decisions.games)) {
  if (!decision.sources.every(source => finalAssets.some(asset => asset.sha256 === source.sha256))) continue;
  if (registry.games[id]) throw Error(`Already imported ${id}`);
  const game = catalog.find(game => game.id === id);
  if (!game || game.listingStatus !== "listed" || Object.entries(decision.identity).some(([key, value]) => game[key] !== value)) throw Error(`Identity mismatch: ${id}`);
  const sourceInputs = await Promise.all(decision.sources.map(async source => {
    const approved = finalAssets.find(asset => asset.sha256 === source.sha256);
    if (/\/(privados|originales)\//.test(approved.path)) throw Error("Private source");
    const bytes = await readFile(approved.path);
    if (sha(bytes) !== source.sha256) throw Error("Source hash mismatch");
    return { source, approved, bytes };
  }));
  const base = `/catalog-covers/${game.platformSlug}/escaneos-propios/${game.slug}`;
  await mkdir(path.join(root, "public", base), { recursive: true });
  const images = [];
  let primaryCoverUrl;
  for (const { source, approved, bytes } of sourceInputs) {
    const input = sharp(bytes), metadata = await input.metadata(), stem = `${base}/${game.slug}-${source.role}`;
    const full = await input.clone().resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 6 }).toBuffer({ resolveWithObject: true });
    const thumb = await input.clone().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 84, effort: 6 }).toBuffer();
    const image = { role: source.role, label: source.label, url: `${stem}.webp`, thumbnailUrl: `${stem}-mini.webp`, width: full.info.width, height: full.info.height };
    await writeFile(path.join(root, "public", image.url), full.data);
    await writeFile(path.join(root, "public", image.thumbnailUrl), thumb);
    evidence.sources.push({ fileName: path.basename(approved.path), sha256: source.sha256, width: metadata.width, height: metadata.height, redactedCodes: approved.redactedCodes ?? 0 });
    evidence.assets.push({ catalogId: id, ...image, sourceSha256: source.sha256, crop: null, sha256: sha(full.data), bytes: full.data.length, thumbnailSha256: sha(thumb), thumbnailBytes: thumb.length });
    images.push(image);
    if (source.role === "portada") {
      const cover = await input.clone().resize({ height: 1400, withoutEnlargement: true }).webp({ quality: 88, effort: 6 }).toBuffer();
      primaryCoverUrl = `${stem}-catalogo.webp`;
      await writeFile(path.join(root, "public", primaryCoverUrl), cover);
      evidence.covers.push({ catalogId: id, url: primaryCoverUrl, sourceSha256: source.sha256, crop: null, sha256: sha(cover), bytes: cover.length });
    }
  }
  if (!primaryCoverUrl || !images.some(image => image.role === "contraportada")) throw Error("Incomplete scan pair");
  const publicDecision = {
    identity: decision.identity, capturedAt: decision.capturedAt,
    sourceLabel: decision.sourceLabel, primaryCaption: decision.primaryCaption,
    packaging: decision.packaging, notes: decision.notes,
  };
  registry.games[id] = { ...publicDecision, primaryCoverUrl, images };
  const before = { catalog: { ...game }, details: details[id] };
  game.coverUrl = primaryCoverUrl;
  game.regionVerified = true;
  game.regionEvidence = [...new Set([...(game.regionEvidence ?? []), "owner_confirmed_pal_es", "owned_scan_spanish_packaging_20260911"])];
  const start = catalogText.indexOf('  {\n    "id": ' + JSON.stringify(id)), end = catalogText.indexOf("\n  }", start) + 4;
  catalogText = catalogText.slice(0, start) + JSON.stringify(game, null, 2).split("\n").map(line => "  " + line).join("\n") + catalogText.slice(end);
  const ownedScan = { url: images.find(image => image.role === "contraportada").url, label: decision.sourceLabel, fetchedAt: decision.capturedAt };
  const nextDetails = { ...details[id], ean: decision.packaging.ean, sources: { ...details[id].sources, ownedScan } };
  detailsText = replaceObject(detailsText, id, nextDetails);
  const chunk = JSON.parse(publicText);
  if (chunk[id]) publicText = replaceObject(publicText, id, { ...chunk[id], ean: nextDetails.ean, sources: { ...chunk[id].sources, ownedScan } }, true);
  audit.games.push({ id, before, after: { coverUrl: game.coverUrl, reference: nextDetails.reference, ean: nextDetails.ean }, mappingNotes: decision.mappingNotes });
  applied.push(id);
}
if (!applied.length) throw Error("No reviewed game matches the supplied final manifest");
audit.decision = "Replace covers only for the exact reviewed owned PAL España editions. Printed packaging evidence is stored by component. No propagation to other variants.";
for (const [file, text] of [["data/catalog.json", catalogText], ["data/game-details.json", detailsText], ["public/catalog-details/ps4.json", publicText]]) { JSON.parse(text); await writeFile(path.join(root, file), text); }
for (const [file, data] of [["data/catalog-owned-scans.json", registry], ["data/research/owned-scans/2026-09-11-assets.json", evidence], ["data/research/owned-scans/2026-09-11-integration.json", audit]]) await writeFile(path.join(root, file), JSON.stringify(data, null, 2) + "\n");
console.log(JSON.stringify({ applied, imagesAdded: applied.length * 2 }));
