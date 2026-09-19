import assert from "node:assert/strict";
import test from "node:test";
import { expandRegionalVariantBatch } from "./admin-regional-variant-batch";
import { buildRuntimeCatalogEditionGuide } from "./catalog-derived-edition-guides";
import type { CatalogGame } from "./types";

const MORTAL_SHELL_GROUPS = [
  { markets: ["GB"], barcode: "5056635624550" },
  { markets: ["FR"], barcode: "5056635624567" },
  { markets: ["IT"], barcode: "5056635624574" },
  { markets: ["ES"], barcode: "5056635624581", packagingLanguages: ["ES"] },
  { markets: ["DE"], barcode: "5056635624598" },
  { markets: ["EU_GENERIC"], barcode: "5056635624611" },
  { markets: ["AU"], barcode: "5056635624604" },
  { markets: ["US", "CA"], barcode: "810136675634" },
  { markets: ["JP"], barcode: "4595057030309", productCodes: ["ELJM-31010"] },
  { markets: ["KR"], confidence: "PENDING_IDENTIFIER" as const },
  { markets: ["HK", "TW"], confidence: "PENDING_IDENTIFIER" as const },
];

test("Mortal Shell II expands 11 physical boxes into 13 regional records", () => {
  const result = expandRegionalVariantBatch({
    title: "Mortal Shell II",
    platformSlug: "ps5",
    physicalVariant: "Standard",
    groups: MORTAL_SHELL_GROUPS,
  });
  assert.ok(!("error" in result));
  assert.equal(result.physicalVariantCount, 11);
  assert.equal(result.rows.length, 13);
  const northAmerica = result.rows.filter((row) => row.market === "US" || row.market === "CA");
  assert.equal(new Set(northAmerica.map((row) => row.group.id)).size, 1);
  assert.equal(northAmerica[0].group.barcode, "810136675634");
  const asia = result.rows.filter((row) => row.market === "HK" || row.market === "TW");
  assert.equal(new Set(asia.map((row) => row.group.id)).size, 1);
  assert.equal(asia[0].group.confidence, "PENDING_IDENTIFIER");
  assert.equal(result.rows.find((row) => row.market === "ES")?.group.packagingLanguages?.[0], "ES");
  assert.equal(new Set(result.rows.map((row) => row.slug)).size, 13);
});

test("a physical box can group markets but cannot cross broad regions", () => {
  const valid = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps5",
    groups: [{ markets: ["FR", "ES", "IT"] }, { markets: ["PT", "GB"] }],
  });
  assert.ok(!("error" in valid));
  assert.equal(valid.rows.length, 5);
  assert.equal(new Set(valid.rows.slice(0, 3).map((row) => row.group.id)).size, 1);

  const invalid = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps5",
    groups: [{ markets: ["ES", "US"] }],
  });
  assert.ok("error" in invalid);
  assert.match(invalid.error, /grandes regiones/);
});

test("V2 keeps regional links but counts one physical edition per shared box", () => {
  const result = expandRegionalVariantBatch({
    title: "Mortal Shell II",
    platformSlug: "ps5",
    physicalVariant: "Standard",
    groups: MORTAL_SHELL_GROUPS,
  });
  assert.ok(!("error" in result));
  const games = result.rows.map((row, index) => ({
    id: `ps5-mortal-shell-ii-${index}`,
    slug: row.slug,
    title: "Mortal Shell II",
    titlePc: "Mortal Shell II",
    platformSlug: "ps5",
    region: row.region,
    marketRegion: row.marketRegion,
    physicalReleaseGroup: row.group,
    physicalVariant: "Standard",
    edition: "standard",
    listingStatus: "listed",
    regionalStatus: "resolved",
    workId: "mortal-shell-ii",
    coverUrl: null,
  } as CatalogGame));
  const guide = buildRuntimeCatalogEditionGuide(games[0], [], games);
  assert.equal(guide.physicalEditions.length, 11);
  const northAmerica = guide.physicalEditions.find((edition) => edition.barcode === "810136675634");
  assert.deepEqual(northAmerica?.marketRegions.sort(), ["CA", "US"]);
  assert.equal(northAmerica?.catalogIds.length, 2);
  const asia = guide.physicalEditions.find((edition) => edition.marketRegions.includes("HK"));
  assert.deepEqual(asia?.marketRegions.sort(), ["HK", "TW"]);
  assert.equal(guide.editionFamilies[0].physicalEditionIds.length, 11);
});
