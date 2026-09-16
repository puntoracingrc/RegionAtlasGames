import assert from "node:assert/strict";
import test from "node:test";
import audit from "../../data/research/ac-liberation-hd-ps3-digital-only-audit-2026-09-15.json";
import { catalog } from "./catalog";
import { getCatalogEditionGuides } from "./catalog-edition-guides";

const DIGITAL_CODES = ["NPUB-31244", "NPEB-01386", "NPJB-00562"];

test("Liberation HD PS3 is explicitly digital-only", () => {
  assert.equal(audit.auditId, "assassins-creed-liberation-hd-ps3-digital-only");
  assert.equal(audit.platformRelease.platformSlug, "ps3");
  assert.equal(audit.platformRelease.releaseType, "DIGITAL");
  assert.equal(audit.platformRelease.physicalStandaloneRelease, false);
  assert.equal(audit.platformRelease.platformReleaseId, "assassins-creed-liberation-hd-ps3");
  assert.deepEqual(
    audit.platformRelease.regionalStoreReleases.map((entry) => entry.storeProductCode),
    DIGITAL_CODES,
  );
});

test("no PS3 physical catalog card is created for Liberation HD", () => {
  const forbidden = catalog.filter((game) => (
    game.platformSlug === "ps3" &&
    game.listingStatus === "listed" &&
    /assassin.*liberation hd/i.test(game.title)
  ));
  assert.deepEqual(forbidden, []);
});

test("PlayStation Store identifiers never become physical identifiers", () => {
  for (const guide of getCatalogEditionGuides()) {
    for (const edition of guide.physicalEditions) {
      const physicalIdentifiers = [
        edition.barcode,
        edition.catalogNumber,
        edition.serial,
        edition.boxCode,
        ...edition.softwareFamilyCodes,
        ...edition.productCodes,
      ].filter(Boolean);
      for (const code of DIGITAL_CODES) {
        assert.equal(physicalIdentifiers.includes(code), false, `${guide.id}/${edition.id}/${code}`);
      }
    }
  }
});

test("the compilation relation is delegated without mutating the PS3 guide in this slice", () => {
  assert.equal(audit.physicalRelationshipPolicy.catalogPhysicalEditionCreationAllowed, false);
  assert.equal(audit.physicalRelationshipPolicy.allowedOnlyAsCompilationContent, true);
  assert.equal(audit.physicalRelationshipPolicy.relationOwnerGuideId, "assassins-creed-american-saga-ps3");
  assert.equal(audit.physicalRelationshipPolicy.relationImplementationInThisSlice, false);
});

test("the physical Vita release remains a different platformRelease", () => {
  const vita = catalog.filter((game) => (
    game.platformSlug === "psvita" && game.title === "Assassin's Creed III: Liberation"
  ));
  assert.equal(vita.length, 2);
  assert.notEqual(audit.platformRelease.platformReleaseId, "assassins-creed-iii-liberation-psvita");
});
