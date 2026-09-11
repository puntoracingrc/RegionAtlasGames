import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import guides from "../../data/catalog-edition-guides.json";
import referenceAssets from "../../data/research/owned-scans/2026-09-12-requiem-reference-assets.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide } from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-url";

test("Requiem comparisons link four existing editions and only highlight the current identity", () => {
  const expected = guides.guides[0].editions;
  assert.equal(expected.length, 4);
  for (const entry of expected) {
    const game = getCatalogGame(entry.catalogId)!;
    const guide = getCatalogEditionGuide(game)!;
    assert.equal(guide.editions.length, 4);
    assert.deepEqual(guide.editions.filter(edition => edition.current).map(edition => edition.catalogId), [game.id]);
    for (const edition of guide.editions) assert.equal(edition.href, catalogGamePath(getCatalogGame(edition.catalogId)!));
    assert.deepEqual(guide.images.map(image => image.key), entry.imageKeys);
    for (const patch of [{ region: "USA" }, { platformSlug: "switch2" }, { edition: "platinum" }, { slug: "resident-evil-requiem-other-box" }]) {
      assert.equal(getCatalogEditionGuide({ ...game, ...patch }), undefined);
    }
  }
  assert.equal(getCatalogEditionGuide(getCatalogGame("ps5-usa-resident-evil-requiem")!), undefined);
  assert.equal(getCatalogEditionGuide(getCatalogGame("ps4-resident-evil-2")!), undefined);
  assert.equal(expected[3].identity.region, "Japón");
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
