import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import scanData from "../../data/catalog-owned-scans.json";
import assetEvidence from "../../data/research/owned-scans/2026-09-11-assets.json";
import integration from "../../data/research/owned-scans/2026-09-11-integration.json";
import assassinsBatch from "../../data/research/owned-scans/2026-09-12-assassins-integration.json";
import residentBatch from "../../data/research/owned-scans/2026-09-12-resident-integration.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-url";
import { getOwnedScanSet, withOwnedScanDetails } from "./catalog-owned-scans";
import { mergeCatalogGameWithOverlay } from "./catalog-overlay-merge";
import { getGameProductReference } from "./game-product-reference";
import { normalizeCatalogGamePresentation } from "./catalog-presentation";
import type { CatalogGame, GameDetails } from "./types";

test("owned scans retain each catalog identity and its existing URL", () => {
  for (const entry of integration.games.filter(entry => !["ps4-deadpool", "ps4-fornite-ps4-promo"].includes(entry.id))) {
    const before = entry.before.catalog as CatalogGame;
    const game = getCatalogGame(entry.id)!;
    const scans = getOwnedScanSet(game)!;
    assert.ok(scans);
    assert.equal(catalogGamePath(game), catalogGamePath(before));
    assert.equal(game.coverUrl, scans.primaryCoverUrl);
    const unchanged = (value: CatalogGame) => {
      const copy = { ...normalizeCatalogGamePresentation(value) };
      delete copy.regionVerified;
      delete copy.regionEvidence;
      return { ...copy, coverUrl: null };
    };
    assert.deepEqual(unchanged(game), unchanged(before));
  }
});

test("scans cannot spread to another territory, platform, edition or similarly named game", () => {
  const game = getCatalogGame("ps4-fortnite")!;
  for (const patch of [
    { region: "PAL Italia" }, { platformSlug: "ps5" }, { edition: "platinum" },
    { slug: "fortnite-con-codigos" }, { id: "ps4-fortnite-con-codigos" },
  ]) assert.equal(getOwnedScanSet({ ...game, ...patch } as CatalogGame), undefined);
  assert.equal(getOwnedScanSet(getCatalogGame("ps5-resident-evil-requiem")!), undefined);
  assert.ok(getOwnedScanSet(getCatalogGame("ps4-deadpool")!));
  assert.equal(getOwnedScanSet(getCatalogGame("ps4-usa-deadpool")!), undefined);
});

test("old overlays keep live prices but cannot restore superseded covers", () => {
  for (const entry of integration.games.filter(entry => entry.id !== "ps4-fornite-ps4-promo")) {
    const game = getCatalogGame(entry.id)!;
    const overlay = { ...entry.before.catalog, recommendedPrice: 37.5, updatedAt: "2026-09-12T12:00:00Z" } as CatalogGame;
    const merged = mergeCatalogGameWithOverlay(game, overlay);
    assert.equal(merged.coverUrl, game.coverUrl);
    assert.equal(merged.regionVerified, game.regionVerified);
    assert.equal(merged.recommendedPrice, 37.5);
    assert.equal(overlay.coverUrl, entry.before.catalog.coverUrl);
  }
});

test("Fortnite Promo keeps its existing route but has its own disc evidence and no assumed country", () => {
  const game = getCatalogGame("ps4-fornite-ps4-promo")!;
  const scans = getOwnedScanSet(game)!;
  assert.equal(game.edition, "promo");
  assert.equal(game.regionVerified, false);
  assert.equal(game.marketRegion, null);
  assert.equal(catalogGamePath(game), "/catalogo/fornite-ps4-promo-ps4-pal-es");
  assert.equal(scans.packaging.ean, null);
  assert.ok(scans.softwareLanguagesPrinted?.text.includes("Español"));
  assert.equal(scans.softwareLanguagesPrinted?.audio.includes("Español"), false);
  assert.equal(scans.images.find(image => image.role === "contraportada")?.redactedCodes, 2);
  const details = withOwnedScanDetails(game, undefined)!;
  assert.equal(details.reference, "CUSA-07669");
  assert.equal(details.releaseDate, null);
  assert.equal(getGameProductReference(game, details)?.label, "Código del disco");
  assert.notEqual(scans.primaryCoverUrl, getCatalogGame("ps4-fortnite")!.coverUrl);
  const before = integration.games.find(entry => entry.id === game.id)!.before.catalog as CatalogGame;
  assert.equal(mergeCatalogGameWithOverlay(game, before), game);
});

test("printed references supersede title matches while preserving documentary history", () => {
  const before = integration.games[0].before.details as unknown as GameDetails;
  const details = withOwnedScanDetails(getCatalogGame("ps4-fortnite")!, before)!;
  assert.equal(details.reference, "CUSA-07669");
  assert.equal(details.ean, "4020628781279");
  assert.equal(details.fieldSources?.reference, "research");
  assert.deepEqual(details.sources?.serialstation, before.sources?.serialstation);
  assert.equal(before.reference, "CUSA-07022");
  const resident = withOwnedScanDetails(getCatalogGame("ps5-resident-evil-requiem-lenticular-cover")!, undefined)!;
  assert.equal(resident.reference, "PPSA-31246");
  assert.equal(resident.ean, "5055060993637");
  assert.equal(resident.releaseDate, null);
  const reference = getGameProductReference(getCatalogGame("ps4-fortnite")!, details)!;
  assert.equal(reference.regionHint, null);
  assert.equal(reference.label, "Código del lomo");
});

test("Harry Potter PS5 scans verify only the Spanish box and its matching disc", () => {
  const game = getCatalogGame("ps5-lego-harry-potter-collection")!;
  const scans = getOwnedScanSet(game)!;
  const details = withOwnedScanDetails(game, undefined)!;
  assert.equal(catalogGamePath(game), "/catalogo/lego-harry-potter-collection-ps5-pal-es");
  assert.equal(details.reference, "PPSA-22946");
  assert.equal(details.ean, "5051893243628");
  assert.equal(details.releaseDate, null);
  assert.deepEqual(scans.packaging.languages, ["Español"]);
  assert.equal(scans.softwareLanguagesPrinted, undefined);
  assert.deepEqual(scans.images.map(image => image.role), ["portada", "contraportada", "lomo", "caratula-completa", "disco"]);
  assert.ok(scans.notes.some(note => note.includes("borde izquierdo")));
  assert.equal(getOwnedScanSet(getCatalogGame("ps4-lego-harry-potter-collection")!), undefined);
  assert.equal(getOwnedScanSet(getCatalogGame("ps5-usa-lego-harry-potter-collection")!), undefined);
});

test("Assassin's Creed sealed boxes keep the scanned Spanish SKU and each component together", () => {
  assert.equal(assassinsBatch.games.length, 9);
  assert.equal(assassinsBatch.images, 25);
  for (const entry of assassinsBatch.games) {
    const game = getCatalogGame(entry.catalogId)!;
    const scans = getOwnedScanSet(game)!;
    const details = withOwnedScanDetails(game, { reference: "CUSA-99999", ean: "0000000000000" } as GameDetails)!;
    assert.equal(details.reference, entry.reference);
    assert.equal(details.ean, entry.ean);
    assert.equal(getGameProductReference(game, details)?.label, "Código del lomo");
    assert.equal(`https://www.regionatlas.games${catalogGamePath(game)}`, entry.url);
    assert.deepEqual(scans.images.map(image => image.role), ["portada", "contraportada", "lomo"]);
    assert.equal(getOwnedScanSet({ ...game, region: "PAL Italia" }), undefined);
    assert.equal(getOwnedScanSet({ ...game, platformSlug: "ps5" }), undefined);
    assert.equal(getOwnedScanSet({ ...game, edition: "gold" }), undefined);
  }
  const mirage = assassinsBatch.games.find(entry => entry.catalogId === "ps4-assassins-creed-mirage-deluxe-edition")!;
  const scans = getOwnedScanSet(getCatalogGame(mirage.catalogId)!)!;
  assert.equal(scans.primaryCoverUrl, mirage.previousScans!.primaryCoverUrl);
  assert.deepEqual(scans.images.slice(0, 2), mirage.previousScans!.images);
  assert.equal(scans.packaging.reference, "CUSA-33151");
  // An explicitly merged duplicate resolves to the survivor; distinct editions do not.
  for (const id of ["ps4-assassin%27s-creed-mirage", "ps4-assassin%27s-creed-unity-special-edition"]) {
    const game = getCatalogGame(id);
    assert.ok(game);
    assert.equal(getOwnedScanSet(game), undefined);
  }
});

test("Assassin's Creed language evidence preserves the printed voice download requirement", () => {
  for (const suffix of ["origins", "odyssey", "valhalla"]) {
    const scans = getOwnedScanSet(getCatalogGame(`ps4-assassins-creed-${suffix}`)!)!;
    assert.match(scans.packaging.languageStatement!, /descargar voces en castellano/);
    assert.equal(scans.softwareLanguagesPrinted, undefined, "Do not turn a qualified box statement into an on-disc language claim");
    assert.ok(scans.notes.some(note => note.includes("no acredita que esas voces estén incluidas en el disco")));
  }
  for (const suffix of ["unity", "3-remastered", "syndicate", "the-ezio-collection"]) {
    const scans = getOwnedScanSet(getCatalogGame(`ps4-assassins-creed-${suffix}`)!)!;
    assert.deepEqual(scans.softwareLanguagesPrinted, { text: ["Español"], audio: ["Español"] });
    assert.equal(scans.packaging.languageStatement, "Voces, textos y manual totalmente en castellano");
  }
});

test("Resident Evil uses the photographed ES/IT box and keeps audio separate from packaging language", () => {
  assert.equal(residentBatch.games.length, 11);
  assert.equal(residentBatch.images, 33);
  const englishAudio = new Set(["ps4-resident-evil-5", "ps4-resident-evil-6", "ps4-resident-evil-origins-collection"]);
  for (const entry of residentBatch.games) {
    const game = getCatalogGame(entry.catalogId)!;
    const scans = getOwnedScanSet(game)!;
    const details = withOwnedScanDetails(game, { reference: "BLES-01465", ean: "0000000000000" } as GameDetails)!;
    assert.equal(details.reference, entry.reference);
    assert.equal(details.ean, entry.ean);
    assert.equal(getGameProductReference(game, details)?.label, "Código del lomo");
    assert.equal(`https://www.regionatlas.games${catalogGamePath(game)}`, entry.url);
    assert.deepEqual(scans.packaging.languages, ["Español", "Italiano"]);
    assert.deepEqual(scans.softwareLanguagesPrinted?.text, ["Español", "Italiano"]);
    assert.deepEqual(scans.softwareLanguagesPrinted?.audio, englishAudio.has(game.id) ? ["Inglés"] : ["Español", "Italiano"]);
    assert.deepEqual(scans.images.map(image => image.role), ["portada", "contraportada", "lomo"]);
    for (const patch of [{ region: "USA" }, { region: "PAL Italia" }, { edition: "collector" }, { id: `${game.id}-different-box` }]) {
      assert.equal(getOwnedScanSet({ ...game, ...patch }), undefined);
    }
  }
});

test("Resident Evil Gold, Steelbook and Requiem Deluxe retain separate physical identities", () => {
  const gold = getOwnedScanSet(getCatalogGame("ps4-resident-evil-7-biohazard-gold-edition")!)!;
  assert.ok(gold.notes.some(note => note.includes("Gold Edition")));
  for (const id of ["ps4-resident-evil-4-remake-steelbook", "ps5-resident-evil-requiem-deluxe-edition"]) {
    const scans = getOwnedScanSet(getCatalogGame(id)!)!;
    assert.ok(scans.images.every(image => image.label.includes("caja exterior")));
    assert.ok(scans.notes.some(note => note.includes("propietario")));
  }
  const lenticular = getOwnedScanSet(getCatalogGame("ps5-resident-evil-requiem-lenticular-cover")!)!;
  assert.deepEqual(lenticular.images, residentBatch.previousLenticularScans.images);
  assert.equal(lenticular.primaryCoverUrl, residentBatch.previousLenticularScans.primaryCoverUrl);
  assert.equal(lenticular.packaging.ean, "5055060993637");
  assert.ok(lenticular.notes.some(note => note.includes("exclusiva por GAME")));
  const deluxe = getOwnedScanSet(getCatalogGame("ps5-resident-evil-requiem-deluxe-edition")!)!;
  assert.equal(deluxe.packaging.ean, "5055060907979");
  assert.notEqual(deluxe.packaging.ean, lenticular.packaging.ean);
  assert.equal(deluxe.packaging.reference, lenticular.packaging.reference);
  assert.equal(getOwnedScanSet(getCatalogGame("ps5-resident-evil-requiem")!), undefined);
});

test("public assets match the reviewed hashes and contain no embedded original metadata", async () => {
  const publicAsset = (url: string) => {
    assert.match(url, /^\/catalog-covers\/ps[45]\/escaneos-propios\/[a-z0-9/-]+\.webp$/);
    return readFileSync(path.join(process.cwd(), "public", url));
  };
  const verify = async (url: string, hash: string) => {
    const bytes = publicAsset(url);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    return metadata;
  };
  for (const asset of assetEvidence.assets) {
    const metadata = await verify(asset.url, asset.sha256);
    assert.equal(metadata.width, asset.width);
    assert.equal(metadata.height, asset.height);
    await verify(asset.thumbnailUrl, asset.thumbnailSha256);
    const source = assetEvidence.sources.find(source => source.sha256 === asset.sourceSha256)!;
    assert.ok(source);
    assert.equal("redactedCodes" in asset ? asset.redactedCodes : 0, source.redactedCodes);
  }
  for (const cover of assetEvidence.covers) {
    await verify(cover.url, cover.sha256);
    assert.ok(cover.bytes < 600_000, "The catalog must use a lightweight cover, not the full scan");
  }
  assert.equal(assetEvidence.sources.reduce((sum, source) => sum + source.redactedCodes, 0), 5);
  assert.doesNotMatch(JSON.stringify(scanData), /\/Users\/|privados|originales|600ppp/);
});
