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

test("Requiem comparisons link four existing editions and only highlight the current identity", () => {
  const expected = getCatalogEditionGuides().find((guide) => guide.id === "resident-evil-requiem-ps5");
  assert.ok(expected);
  assert.equal(expected.schemaVersion, 1);
  assert.equal(expected.physicalEditions.length, 4);
  for (const entry of expected.physicalEditions) {
    const game = getCatalogGame(entry.catalogIds[0])!;
    const guide = getCatalogEditionGuide(game)!;
    assert.equal(guide.physicalEditions.length, 4);
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
    for (const patch of [{ region: "USA" }, { platformSlug: "switch2" }, { edition: "platinum" }, { slug: "resident-evil-requiem-other-box" }]) {
      assert.equal(getCatalogEditionGuide({ ...game, ...patch }), undefined);
    }
  }
  assert.equal(getCatalogEditionGuide(getCatalogGame("ps5-usa-resident-evil-requiem")!), undefined);
  assert.equal(getCatalogEditionGuide(getCatalogGame("ps4-resident-evil-2")!), undefined);
  assert.equal(expected.physicalEditions[3].catalogLinks[0].region, "Japón");
  assert.equal(guides.schemaVersion, 2);
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
