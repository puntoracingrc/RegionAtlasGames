import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import guides from "../../data/catalog-edition-guides.json";
import referenceAssets from "../../data/research/owned-scans/2026-09-12-requiem-reference-assets.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-url";

test("Requiem uses V2, retains its reviewed editions and absorbs published regional siblings", () => {
  const expected = getCatalogEditionGuides().find((guide) => guide.id === "resident-evil-requiem-ps5");
  assert.ok(expected);
  assert.equal(expected.schemaVersion, 2);
  assert.equal(expected.physicalEditions.length, 6);
  for (const entry of expected.physicalEditions) {
    const game = getCatalogGame(entry.catalogIds[0])!;
    const guide = getCatalogEditionGuide(game)!;
    assert.equal(guide.physicalEditions.length, expected.physicalEditions.length);
    assert.deepEqual(
      guide.physicalEditions.flatMap((edition) => edition.catalogLinks.filter((link) => link.current).map((link) => link.catalogId)),
      [game.id],
    );
    for (const edition of guide.physicalEditions) {
      for (const link of edition.catalogLinks) assert.equal(link.href, catalogGamePath(getCatalogGame(link.catalogId)!));
    }
    assert.deepEqual(
      guide.physicalEditions.find((edition) => edition.id === entry.id)?.images.map((image) => image.key),
      entry.images.map((image) => image.key),
    );
    for (const patch of [{ region: game.region === "USA" ? "PAL España" : "USA" }, { platformSlug: "switch2" }, { edition: "platinum" }, { slug: "resident-evil-requiem-other-box" }]) {
      assert.equal(getCatalogEditionGuide({ ...game, ...patch }), undefined);
    }
  }
  assert.equal(
    getCatalogEditionGuide(getCatalogGame("ps5-usa-resident-evil-requiem")!)?.id,
    expected.id,
  );
  assert.equal(
    getCatalogEditionGuide(getCatalogGame("ps4-resident-evil-2")!)?.origin,
    "catalog-derived",
  );
  assert.equal(expected.physicalEditions[3].catalogLinks[0].region, "Japón");
  assert.equal(guides.schemaVersion, 2);
});

test("Admin regional groups rebuild a legacy catalog card as one runtime V2 sheet", () => {
  const legacy = getCatalogGame("n64-007-world-is-not-enough");
  assert.ok(legacy);
  const shared = {
    ...legacy,
    title: "007: The World Is Not Enough",
    titlePc: "007: The World Is Not Enough",
    workId: "007-the-world-is-not-enough",
    regionalStatus: "resolved" as const,
    physicalVariant: "Standard",
  };
  const europe = {
    ...shared,
    physicalReleaseGroup: {
      id: "n64:007-the-world-is-not-enough:standard:01-eu",
      label: "Europa",
      barcode: null,
      productCodes: ["NUS-N07P"],
      packagingLanguages: [],
      softwareLanguages: [],
      confidence: "PENDING_IDENTIFIER" as const,
      images: [],
      notes: [],
    },
  };
  const france = {
    ...shared,
    id: "n64-007-the-world-is-not-enough-fr",
    slug: "007-the-world-is-not-enough-fr",
    region: "PAL Francia",
    marketRegion: "FR",
    coverUrl: null,
    physicalReleaseGroup: {
      id: "n64:007-the-world-is-not-enough:standard:02-fr",
      label: "Francia",
      barcode: "5030931024870",
      productCodes: ["NUS-NO7P-FRA"],
      packagingLanguages: ["FR"],
      softwareLanguages: [],
      confidence: "CONFIRMED" as const,
      images: [],
      notes: [],
    },
  };

  const guide = getCatalogEditionGuide(europe, [europe, france]);
  assert.ok(guide);
  assert.equal(guide.schemaVersion, 2);
  assert.equal(guide.origin, "catalog-derived");
  assert.equal(guide.physicalEditions.length, 2);
  assert.equal(guide.currentEditionId, "catalog-edition-group-n64-007-the-world-is-not-enough-standard-01-eu");
  assert.ok(guide.currentEditionFamilyId);
  const family = guide.editionFamilies.find((entry) => entry.id === guide.currentEditionFamilyId);
  assert.ok(family);
  assert.deepEqual(
    family.physicalEditionIds,
    guide.physicalEditions.map((edition) => edition.id),
  );
  assert.deepEqual(
    guide.physicalEditions.map((edition) => edition.catalogIds),
    [[legacy.id], [france.id]],
  );
});

test("reference illustrations are distinct from physical scans and retain their reviewed image bytes", async () => {
  for (const asset of referenceAssets.images) {
    for (const [url, hash] of [[asset.url, asset.sha256], [asset.thumbnailUrl, asset.thumbnailSha256]]) {
      assert.match(url, /^\/catalog-covers\/ps5\/ediciones-documentadas\/resident-evil-requiem\/[a-z-]+\.webp$/);
      const bytes = readFileSync(path.join(process.cwd(), "public", url));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.xmp, undefined);
    }
  }
  assert.match(referenceAssets.images.find(image => image.key === "estandar-contenido")!.caption, /No muestra la lámina/);
  assert.match(referenceAssets.images.find(image => image.key === "deluxe-contenido")!.caption, /contenido del juego/);
});
