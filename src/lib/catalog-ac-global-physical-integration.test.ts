import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuides } from "./catalog-edition-guides";
import { isReleasedPhysicalEdition } from "./catalog-edition-guide-types";

const expectedCanonicalCatalogIds = [
  "wiiu-assassin-s-creed-iii",
  "wiiu-assassin-s-creed-iv-black-flag",
  "xbox360-assassin-s-creed-rogue",
  "xbox360-assassin-s-creed-anthology",
  "xbox360-assassin-s-creed-heritage-collection",
  "xbox360-assassin-s-creed-double-pack",
  "xbox360-assassin-s-creed-brotherhood-revelations-double-pack",
  "xbox360-assassin-s-creed-ezio-trilogy",
  "xbox360-assassin-s-creed-american-saga",
  "xbox360-assassin-s-creed-black-flag-rogue-double-pack",
  "xbox360-assassin-s-creed-iii",
  "xbox360-assassin-s-creed-iv-black-flag",
] as const;

test("every new physical guide has a public canonical catalog identity", () => {
  const guides = getCatalogEditionGuides();
  for (const catalogId of expectedCanonicalCatalogIds) {
    const game = getCatalogGame(catalogId);
    assert.ok(game, `missing canonical catalog row: ${catalogId}`);
    assert.equal(game.listingStatus, "listed");
    assert.ok(
      guides.some((guide) => guide.game.canonicalCatalogId === catalogId),
      `missing registered guide: ${catalogId}`,
    );
  }
  assert.equal(getCatalogGame("xbox360-assassin-s-creed-liberation-hd"), undefined);
});

test("expanded guides replace older guides by stable id without duplicate ownership", () => {
  const guides = getCatalogEditionGuides();
  const guideIds = guides.map((guide) => guide.id);
  assert.equal(new Set(guideIds).size, guideIds.length);
  assert.equal(guideIds.filter((id) => id === "assassins-creed-iii-ps3").length, 1);

  const ownerByCatalogId = new Map<string, string>();
  for (const guide of guides) {
    const ownedIds = [
      ...guide.physicalEditions.flatMap((edition) => edition.catalogIds),
      ...guide.physicalBonusItems.flatMap((item) => item.catalogIds),
    ];
    for (const catalogId of ownedIds) {
      const previousOwner = ownerByCatalogId.get(catalogId);
      assert.equal(previousOwner, undefined, `${catalogId} owned by ${previousOwner} and ${guide.id}`);
      ownerByCatalogId.set(catalogId, guide.id);
    }
  }
});

test("non-retail and download carriers never inflate native physical counts", () => {
  const editions = getCatalogEditionGuides().flatMap((guide) => guide.physicalEditions);
  const excludedStatuses = new Set([
    "GAME_KEY_CARD",
    "CODE_IN_BOX",
    "COLLECTOR_WITHOUT_GAME",
    "DIGITAL_ONLY",
    "CANCELED_PHYSICAL",
    "PROMOTIONAL_NOT_FOR_RESALE",
    "PRESS_KIT",
    "RETAILER_BUNDLE",
    "HARDWARE_BUNDLE",
    "UNKNOWN_PHYSICAL_STATUS",
  ]);
  for (const edition of editions) {
    if (edition.releaseStatus === "CANCELED_PHYSICAL_RELEASE" ||
      (edition.physicalContentStatus && excludedStatuses.has(edition.physicalContentStatus))) {
      assert.equal(isReleasedPhysicalEdition(edition), false, edition.id);
    }
  }

  for (const id of [
    "ac3-ps3-nfr-us-legacy",
    "ac3-ps3-nfr-ca",
    "assassins-creed-revelations-ps3-europe-promo",
    "ac-bloodlines-psp-nfr-us",
    "ac3r-switch-code-in-box-unverified",
  ]) {
    const edition = editions.find((candidate) => candidate.id === id);
    assert.ok(edition, id);
    assert.equal(isReleasedPhysicalEdition(edition), false, id);
  }
});

test("Nintendo media semantics distinguish cartridges, Game-Key Cards and code boxes", () => {
  const nintendoEditions = getCatalogEditionGuides()
    .filter((guide) => ["switch", "switch2", "wiiu"].includes(guide.game.platformSlug))
    .flatMap((guide) => guide.physicalEditions)
    .filter((edition) => edition.physicalContentStatus);

  assert.ok(nintendoEditions.some((edition) => edition.physicalProductType === "NATIVE_GAME_CARD"));
  assert.ok(nintendoEditions.some((edition) => edition.physicalProductType === "GAME_KEY_CARD"));
  assert.ok(nintendoEditions.some((edition) => edition.physicalProductType === "DOWNLOAD_CODE_IN_BOX"));
  assert.ok(nintendoEditions.some((edition) => edition.physicalProductType === "NATIVE_GAME_DISC"));
  for (const edition of nintendoEditions) {
    if (edition.physicalProductType === "GAME_KEY_CARD" ||
      edition.physicalProductType === "DOWNLOAD_CODE_IN_BOX") {
      assert.equal(isReleasedPhysicalEdition(edition), false, edition.id);
    }
  }
});

test("compilation links resolve only to public catalog games and keep Liberation HD voucher-only", () => {
  for (const guide of getCatalogEditionGuides()) {
    for (const edition of guide.physicalEditions) {
      for (const catalogId of edition.containsCatalogIds) {
        assert.ok(getCatalogGame(catalogId), `${edition.id}: ${catalogId}`);
        assert.notEqual(catalogId, "xbox360-assassin-s-creed-liberation-hd");
      }
    }
  }
  const americanSaga = getCatalogEditionGuides().find(
    (guide) => guide.id === "assassins-creed-american-saga-americas-collection-xbox360",
  );
  assert.ok(americanSaga);
  assert.ok(americanSaga.physicalEditions.every((edition) => (
    edition.digitalContents.some((content) => /Liberation HD.*voucher.*no disco/i.test(content))
  )));
});

test("Xbox 360 support identifiers never contain PlayStation serial families", () => {
  const xboxGuides = getCatalogEditionGuides().filter((guide) => guide.game.platformSlug === "xbox360");
  const playStationSerial = /\b(?:BLES|BLUS|BLJM|PLAS|PLJM|CUSA|PPSA)-?\d/i;
  for (const guide of xboxGuides) {
    for (const edition of guide.physicalEditions) {
      const identifiers = [
        edition.catalogNumber,
        edition.serial,
        edition.boxCode,
        ...edition.softwareFamilyCodes,
        ...edition.productCodes,
      ].filter(Boolean).join(" ");
      assert.doesNotMatch(identifiers, playStationSerial, edition.id);
    }
  }
});
