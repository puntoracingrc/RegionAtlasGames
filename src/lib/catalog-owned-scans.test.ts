import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import scanData from "../../data/catalog-owned-scans.json";
import assetEvidence from "../../data/research/owned-scans/2026-09-11-assets.json";
import integration from "../../data/research/owned-scans/2026-09-11-integration.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-url";
import { getOwnedScanSet, withOwnedScanDetails } from "./catalog-owned-scans";
import { mergeCatalogGameWithOverlay } from "./catalog-overlay-merge";
import { getGameProductReference } from "./game-product-reference";
import type { CatalogGame, GameDetails } from "./types";

test("owned scans retain each catalog identity and its existing URL", () => {
  for (const entry of integration.games) {
    const before = entry.before.catalog as CatalogGame;
    const game = getCatalogGame(entry.id)!;
    const scans = getOwnedScanSet(game)!;
    assert.ok(scans);
    assert.equal(catalogGamePath(game), catalogGamePath(before));
    assert.equal(game.coverUrl, scans.primaryCoverUrl);
    const unchanged = (value: CatalogGame) => {
      const copy = { ...value };
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
});

test("old overlays keep live prices but cannot restore superseded covers", () => {
  for (const entry of integration.games) {
    const game = getCatalogGame(entry.id)!;
    const overlay = { ...entry.before.catalog, recommendedPrice: 37.5 } as CatalogGame;
    const merged = mergeCatalogGameWithOverlay(game, overlay);
    assert.equal(merged.coverUrl, game.coverUrl);
    assert.equal(merged.regionVerified, true);
    assert.equal(merged.recommendedPrice, 37.5);
    assert.equal(overlay.coverUrl, entry.before.catalog.coverUrl);
  }
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
  assert.equal(assetEvidence.sources.reduce((sum, source) => sum + source.redactedCodes, 0), 3);
  assert.doesNotMatch(JSON.stringify(scanData), /\/Users\/|privados|originales|600ppp/);
});
