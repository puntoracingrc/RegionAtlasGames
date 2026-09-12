import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import guideDocument from "../../data/catalog-edition-guides.json";
import scanAssets from "../../data/research/owned-scans/2026-09-12-absolum-special-edition-assets.json";
import schemaDocument from "../../data/schemas/catalog-edition-guides-v2.schema.json";
import { catalog, getCatalogGame } from "./catalog";
import {
  getCatalogEditionGuides,
  normalizeCatalogEditionGuide,
  type RawCatalogEditionGuide,
} from "./catalog-edition-guides";
import {
  BROAD_REGION_VALUES,
  PHYSICAL_EDITION_TYPE_VALUES,
  PHYSICAL_EVIDENCE_TYPE_VALUES,
  canEvidenceDefinePhysicalVariant,
} from "./catalog-edition-guide-types";
import { filterCatalogGames, type CatalogFilterState } from "./catalog-filters";
import { toCatalogListGame } from "./catalog-list-game";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";
import { catalogGamePath } from "./catalog-url";
import { catalogConditionPriceRows } from "./price-display";

const ABSOLUM_CATALOG_IDS = [
  "ps5-absolum",
  "ps5-absolum-special-edition",
  "ps5-usa-absolum",
] as const;

function absolumGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === "absolum-ps5");
  assert.ok(guide);
  assert.equal(guide.schemaVersion, 2);
  return guide;
}

function groupedAbsolum() {
  const source = ABSOLUM_CATALOG_IDS.map((id) => toCatalogListGame(getCatalogGame(id)!));
  const grouped = groupCatalogListGames(source);
  assert.equal(grouped.length, 1);
  return grouped;
}

const defaultFilters: CatalogFilterState = {
  q: "",
  region: "all",
  platform: "all",
  sort: "title-asc",
  priceFilter: "all",
};

test("schema v2 keeps legacy guides readable and enumerations synchronized", () => {
  assert.equal(guideDocument.schemaVersion, 2);
  assert.ok(guideDocument.guides.some((guide) => !("schemaVersion" in guide)));
  assert.ok(guideDocument.guides.some((guide) => "schemaVersion" in guide && guide.schemaVersion === 2));
  assert.equal(schemaDocument.properties.schemaVersion.const, 2);
  assert.deepEqual(schemaDocument.$defs.broadRegion.enum, [...BROAD_REGION_VALUES]);
  assert.deepEqual(schemaDocument.$defs.editionType.enum, [...PHYSICAL_EDITION_TYPE_VALUES]);
  assert.deepEqual(schemaDocument.$defs.evidenceType.enum, [...PHYSICAL_EVIDENCE_TYPE_VALUES]);
});

test("Absolum models seven editions, three broad regions and one shared European disc", () => {
  const guide = absolumGuide();
  assert.equal(guide.physicalEditions.length, 7);
  assert.deepEqual([...new Set(guide.physicalEditions.map((edition) => edition.broadRegion))], [
    "EUROPE",
    "NORTH_AMERICA",
    "ASIA",
  ]);

  const european = guide.physicalEditions.filter((edition) => edition.broadRegion === "EUROPE");
  assert.equal(european.length, 3);
  assert.deepEqual([...new Set(european.map((edition) => edition.sharedDiscId))], ["absolum-ps5-europe-disc"]);
  const disc = guide.sharedDiscs.find((entry) => entry.id === "absolum-ps5-europe-disc");
  assert.ok(disc);
  assert.deepEqual(disc.ratingSystems, ["PEGI", "USK"]);
  assert.equal(disc.evidence[0]?.type, "OWNER_CONFIRMATION");

  const special = european.find((edition) => edition.editionType === "SPECIAL");
  assert.ok(special);
  assert.deepEqual(special.includesEditionIds, ["absolum-ps5-europe-standard-en-fr-es"]);
  assert.deepEqual(special.containsCatalogIds, ["ps5-absolum"]);
  assert.equal(special.barcode, "5061078710685");
  assert.ok(special.physicalContents.includes("4 pins metálicos"));
  assert.deepEqual(special.digitalContents, ["Banda sonora digital"]);
  assert.ok(special.evidence.some((entry) => entry.type === "PUBLISHER_DOCUMENTATION"));
  assert.deepEqual(
    [special.dimensions?.widthCm, special.dimensions?.heightCm, special.dimensions?.depthCm],
    [14.8, 22.3, 3.2],
  );
  assert.equal(special.dimensions?.approximate, true);
  assert.deepEqual(
    [special.dimensions?.comparison?.widthCm, special.dimensions?.comparison?.heightCm, special.dimensions?.comparison?.depthCm],
    [13.5, 17, 1.5],
  );
});

test("real owned scans are referenced once and weak assets cannot define a physical variant", async () => {
  const guide = absolumGuide();
  const special = guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-europe-special")!;
  assert.deepEqual(special.scanSetIds, ["ps5-absolum-special-edition"]);
  const scans = getOwnedScanSetById(special.scanSetIds[0]);
  assert.ok(scans);
  assert.equal(scans.packaging.ean, "5061078710685");
  assert.match(scans.packaging.marketEvidence, /no determinan un país de distribución exclusivo/i);
  assert.deepEqual(scans.images.map((image) => image.role), ["portada", "contraportada", "lomo"]);
  assert.equal(canEvidenceDefinePhysicalVariant("REAL_SCAN"), true);
  for (const type of ["RETAILER_ASSET", "PUBLISHER_MOCKUP", "PRE_RELEASE_ASSET"] as const) {
    assert.equal(canEvidenceDefinePhysicalVariant(type), false);
  }

  for (const asset of scanAssets.outputs) {
    const bytes = readFileSync(path.join(process.cwd(), "public", asset.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
  }
});

test("Absolum appears once and child filters never duplicate its Game + Platform root", () => {
  const grouped = groupedAbsolum();
  const summary = grouped[0].physicalEditionGroup;
  assert.ok(summary);
  assert.equal(grouped[0].id, "ps5-absolum");
  assert.equal(summary.physicalEditionCount, 7);
  assert.deepEqual(summary.catalogIds.sort(), [...ABSOLUM_CATALOG_IDS].sort());

  const filters: CatalogFilterState[] = [
    { ...defaultFilters, broadRegion: "EUROPE" },
    { ...defaultFilters, ratingSystem: "USK" },
    { ...defaultFilters, physicalEditionType: "SPECIAL" },
  ];
  for (const state of filters) {
    const result = filterCatalogGames(grouped, state, { platforms: true, regions: true });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, "ps5-absolum");
  }
});

test("legacy IDs and direct URLs remain unique while optical group prices omit loose disc", () => {
  assert.equal(new Set(catalog.map((game) => game.id)).size, catalog.length);
  const urls = ABSOLUM_CATALOG_IDS.map((id) => catalogGamePath(getCatalogGame(id)!));
  assert.equal(new Set(urls).size, ABSOLUM_CATALOG_IDS.length);
  for (const id of ABSOLUM_CATALOG_IDS) assert.equal(getCatalogGame(id)?.id, id);

  const prices = catalogConditionPriceRows(groupedAbsolum()[0]);
  assert.deepEqual(prices.map((row) => row.condition), ["sealed", "complete"]);
  assert.ok(prices.every((row) => row.condition !== "loose"));
});

test("a SIAE marking is a collectible variant with its own price identity, not another game", () => {
  const fixture: RawCatalogEditionGuide = {
    schemaVersion: 2,
    id: "resident-evil-4-ps5-siae-concept",
    title: "Resident Evil 4 PS5 · prueba conceptual SIAE",
    reviewedAt: "2026-09-12",
    note: "Fixture conceptual; no publica una clasificación factual.",
    game: {
      title: "Resident Evil 4 Remake",
      platformSlug: "ps5",
      canonicalCatalogId: "ps5-resident-evil-4-remake",
    },
    physicalEditions: [{
      id: "resident-evil-4-ps5-europe-es-it",
      label: "Edición física ES / IT",
      broadRegion: "EUROPE",
      editionType: "STANDARD",
      barcode: "concept-shared-ean",
      sharedDiscId: "resident-evil-4-ps5-europe-disc",
      catalogIds: ["ps5-resident-evil-4-remake"],
      variants: [
        { id: "resident-evil-4-no-siae", label: "Sin SIAE", priceIdentity: "re4-ps5-es-it:no-siae" },
        { id: "resident-evil-4-siae", label: "Con SIAE", stickers: ["SIAE"], priceIdentity: "re4-ps5-es-it:siae" },
      ],
    }],
    sharedDiscs: [{ id: "resident-evil-4-ps5-europe-disc", label: "Disco europeo compartido" }],
    evidence: [],
    sources: [],
    evidenceNote: "Solo valida la capacidad del modelo.",
  };
  const normalized = normalizeCatalogEditionGuide(fixture);
  assert.equal(normalized.physicalEditions.length, 1);
  assert.equal(normalized.physicalEditions[0].variants.length, 2);
  assert.equal(new Set(normalized.physicalEditions[0].variants.map((variant) => variant.priceIdentity)).size, 2);
  assert.deepEqual(normalized.physicalEditions[0].variants[1].stickers, ["SIAE"]);
  assert.equal(normalized.physicalEditions[0].sharedDiscId, "resident-evil-4-ps5-europe-disc");
});
