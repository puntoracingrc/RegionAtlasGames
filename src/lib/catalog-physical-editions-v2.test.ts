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
  catalogEditionFamilyCountLabel,
  catalogEditionFamilyHasVariants,
  isStrongPhysicalEvidence,
} from "./catalog-edition-guide-types";
import { filterCatalogGames, type CatalogFilterState } from "./catalog-filters";
import { toCatalogListGame } from "./catalog-list-game";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";
import {
  collectionItemMatchesPhysicalVariant,
  collectionPhysicalIdentityKey,
  countOwnedPhysicalVariant,
  resolveCatalogPhysicalVariant,
} from "./catalog-physical-variant";
import { catalogGameToCollectionItem } from "./collection-store";
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
  assert.equal(grouped.length, 2);
  return grouped;
}

const defaultFilters: CatalogFilterState = {
  q: "",
  region: "all",
  platform: "all",
  sort: "title-asc",
  priceFilter: "all",
};

test("edition families expose variant terminology only when alternatives exist", () => {
  assert.equal(catalogEditionFamilyHasVariants(0), false);
  assert.equal(catalogEditionFamilyHasVariants(1), false);
  assert.equal(catalogEditionFamilyHasVariants(2), true);
  assert.equal(catalogEditionFamilyCountLabel(1), "1 edición física");
  assert.equal(catalogEditionFamilyCountLabel(2), "2 variantes físicas");
});

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
  assert.deepEqual(guide.editionFamilies.map((family) => [family.id, family.physicalEditionIds.length]), [
    ["standard", 6],
    ["special", 1],
  ]);
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

test("verified regional covers remain bound to their exact Absolum variant", async () => {
  const guide = absolumGuide();
  const expected = new Map([
    ["absolum-ps5-europe-standard-de", "197840889144"],
    ["absolum-ps5-asia-japan", "287136123203"],
    ["absolum-ps5-asia-korea", "157360068354"],
    ["absolum-ps5-asia-hk-tw", null],
  ]);

  for (const [editionId, ebayItemId] of expected) {
    const edition = guide.physicalEditions.find((entry) => entry.id === editionId);
    assert.ok(edition);
    assert.equal(edition.images.length, 1);
    assert.equal(isStrongPhysicalEvidence(edition.images[0].evidenceType), true);
    assert.ok(edition.evidence.some((entry) => isStrongPhysicalEvidence(entry.type)));
    if (ebayItemId) {
      assert.ok(edition.evidence.some((entry) => entry.url?.endsWith(`/itm/${ebayItemId}`)));
    } else {
      assert.match(edition.evidence[0]?.summary ?? "", /no demuestra.*Hong Kong.*Taiwán/i);
    }

    for (const url of [edition.images[0].url, edition.images[0].thumbnailUrl]) {
      const bytes = readFileSync(path.join(process.cwd(), "public", url));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.xmp, undefined);
    }
  }
});

test("Absolum exposes separate Standard and Special roots and filters each family independently", () => {
  const grouped = groupedAbsolum();
  const standard = grouped.find((game) => game.id === "ps5-absolum");
  const special = grouped.find((game) => game.id === "ps5-absolum-special-edition");
  assert.ok(standard?.physicalEditionGroup);
  assert.ok(special?.physicalEditionGroup);
  assert.equal(standard.physicalEditionGroup.editionFamilyLabel, "Standard Edition");
  assert.equal(standard.physicalEditionGroup.physicalEditionCount, 6);
  assert.deepEqual(standard.physicalEditionGroup.catalogIds.sort(), ["ps5-absolum", "ps5-usa-absolum"]);
  assert.equal(special.physicalEditionGroup.editionFamilyLabel, "Special Edition");
  assert.equal(special.physicalEditionGroup.physicalEditionCount, 1);
  assert.deepEqual(special.physicalEditionGroup.catalogIds, ["ps5-absolum-special-edition"]);

  const usk = filterCatalogGames(grouped, { ...defaultFilters, ratingSystem: "USK" }, { platforms: true, regions: true });
  assert.deepEqual(usk.items.map((game) => game.id), ["ps5-absolum"]);
  const specialOnly = filterCatalogGames(grouped, { ...defaultFilters, physicalEditionType: "SPECIAL" }, { platforms: true, regions: true });
  assert.deepEqual(specialOnly.items.map((game) => game.id), ["ps5-absolum-special-edition"]);
  const standardOnly = filterCatalogGames(grouped, { ...defaultFilters, physicalEditionType: "STANDARD" }, { platforms: true, regions: true });
  assert.deepEqual(standardOnly.items.map((game) => game.id), ["ps5-absolum"]);
  const europe = filterCatalogGames(grouped, { ...defaultFilters, broadRegion: "EUROPE" }, { platforms: true, regions: true });
  assert.deepEqual(europe.items.map((game) => game.id).sort(), ["ps5-absolum", "ps5-absolum-special-edition"]);
});

test("legacy IDs and direct URLs remain unique while optical group prices omit loose disc", () => {
  assert.equal(new Set(catalog.map((game) => game.id)).size, catalog.length);
  const urls = ABSOLUM_CATALOG_IDS.map((id) => catalogGamePath(getCatalogGame(id)!));
  assert.equal(new Set(urls).size, ABSOLUM_CATALOG_IDS.length);
  for (const id of ABSOLUM_CATALOG_IDS) assert.equal(getCatalogGame(id)?.id, id);

  const standard = groupedAbsolum().find((game) => game.id === "ps5-absolum");
  assert.ok(standard);
  const prices = catalogConditionPriceRows(standard);
  assert.deepEqual(prices.map((row) => row.condition), ["sealed", "complete"]);
  assert.ok(prices.every((row) => row.condition !== "loose"));
});

test("only Absolum opts into edition families and legacy catalog IDs retain exact variant meaning", () => {
  const guidesWithFamilies = getCatalogEditionGuides().filter((guide) => guide.editionFamilies.length > 0);
  assert.deepEqual(guidesWithFamilies.map((guide) => guide.id), ["absolum-ps5"]);

  const legacyGuide = getCatalogEditionGuides().find((guide) => guide.id === "resident-evil-requiem-ps5");
  assert.ok(legacyGuide);
  const legacyIds = legacyGuide.physicalEditions.flatMap((edition) => edition.catalogIds);
  const legacyGames = legacyIds.map((id) => toCatalogListGame(getCatalogGame(id)!));
  assert.deepEqual(groupCatalogListGames(legacyGames).map((game) => game.id), legacyIds);

  assert.equal(
    resolveCatalogPhysicalVariant("ps5-absolum")?.physicalVariantId,
    "absolum-ps5-europe-standard-en-fr-es",
  );
  assert.equal(
    resolveCatalogPhysicalVariant("ps5-absolum-special-edition")?.physicalVariantId,
    "absolum-ps5-europe-special",
  );
  assert.equal(
    resolveCatalogPhysicalVariant("ps5-usa-absolum")?.physicalVariantId,
    "absolum-ps5-north-america-standard",
  );
});

test("explicit physical variants sharing a technical catalog ID remain independent", () => {
  const game = getCatalogGame("ps5-absolum");
  assert.ok(game);
  const legacy = catalogGameToCollectionItem(game, []);
  const german = catalogGameToCollectionItem(
    game,
    [legacy],
    "complete",
    "absolum-ps5-europe-standard-de",
  );
  const korean = catalogGameToCollectionItem(
    game,
    [legacy, german],
    "complete",
    "absolum-ps5-asia-korea",
  );
  const items = [legacy, german, korean];

  assert.equal(new Set(items.map(collectionPhysicalIdentityKey)).size, 3);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-europe-standard-en-fr-es"), 1);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-europe-standard-de"), 1);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-asia-korea"), 1);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-asia-japan"), 0);
  assert.equal(collectionItemMatchesPhysicalVariant(german, "absolum-ps5-europe-standard-en-fr-es"), false);
  assert.equal(collectionItemMatchesPhysicalVariant(korean, "absolum-ps5-asia-japan"), false);
  assert.equal(
    resolveCatalogPhysicalVariant("ps5-absolum-special-edition", "absolum-ps5-europe-standard-de"),
    undefined,
  );
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
