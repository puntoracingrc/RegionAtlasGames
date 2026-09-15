import assert from "node:assert/strict";
import test from "node:test";
import guideDocument from "../../data/catalog-edition-guides-ac-portables.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-url";

type RawEdition = {
  id: string;
  editionType: string;
  releaseStatus?: string;
  marketRegions?: string[];
  packagingLanguages?: string[];
  softwareLanguages?: string[];
  softwareFamilyCodes?: string[];
  productCodes?: string[];
  barcode?: string;
  catalogNumber?: string;
  confidence?: string;
  catalogIds?: string[];
  notes?: string[];
};

type RawGuide = {
  id: string;
  game: { platformReleaseId?: string; aliases?: string[] };
  editionFamilies: Array<{ id: string; physicalEditionIds: string[] }>;
  physicalEditions: RawEdition[];
  researchTasks: Array<{ id: string }>;
};

const rawGuides = guideDocument.guides as unknown as RawGuide[];

function guide(id: string) {
  const value = rawGuides.find((entry) => entry.id === id);
  assert.ok(value, `missing guide ${id}`);
  return value;
}

function edition(guideId: string, editionId: string): RawEdition {
  const value = guide(guideId).physicalEditions.find((entry) => entry.id === editionId);
  assert.ok(value, `missing edition ${editionId}`);
  return value;
}

const LIBERATION = "assassins-creed-iii-liberation-psvita-worldwide";
const BLOODLINES = "assassins-creed-bloodlines-psp-worldwide";
const ALTAIRS = "assassins-creed-altairs-chronicles-ds-worldwide";
const DISCOVERY = "assassins-creed-ii-discovery-ds-worldwide";

test("the portable overlay is four independent schema V2 guides", () => {
  assert.equal(guideDocument.schemaVersion, 2);
  assert.deepEqual(rawGuides.map((entry) => entry.id), [
    LIBERATION,
    BLOODLINES,
    ALTAIRS,
    DISCOVERY,
  ]);
  assert.deepEqual(rawGuides.map((entry) => entry.game.platformReleaseId), [
    "assassins-creed-iii-liberation-psvita",
    "assassins-creed-bloodlines-psp",
    "assassins-creed-altairs-chronicles-ds",
    "assassins-creed-ii-discovery-ds",
  ]);
  for (const current of rawGuides) {
    const assigned = current.editionFamilies.flatMap((family) => family.physicalEditionIds);
    assert.equal(new Set(assigned).size, current.physicalEditions.length, current.id);
    assert.deepEqual(new Set(assigned), new Set(current.physicalEditions.map((entry) => entry.id)), current.id);
  }
});

test("all ten historical catalog identities, covers, routes and regional prices stay intact", () => {
  const snapshots = [
    ["psvita-assassin-s-creed-iii-liberation", "/covers/psvita/assassin-s-creed-iii-liberation.jpg", "/catalogo/assassin-s-creed-iii-liberation-psvita-pal-es", null],
    ["psvita-usa-assassin-s-creed-iii-liberation", "/covers/psvita/usa-assassin-s-creed-iii-liberation.jpg", "/catalogo/assassin-s-creed-iii-liberation-psvita-pal-us", 14.24],
    ["psp-assassin-s-creed-bloodlines", "/covers/psp/assassin-s-creed-bloodlines.jpg", "/catalogo/assassin-s-creed-bloodlines-psp-pal-es", null],
    ["psp-usa-assassin-s-creed-bloodlines", "/covers/psp/usa-assassin-s-creed-bloodlines.jpg", "/catalogo/assassin-s-creed-bloodlines-psp-pal-us", 18.98],
    ["psp-assassin-s-creed-bloodlines-essentials", "/covers/psp/assassin-s-creed-bloodlines-essentials.jpg", "/catalogo/assassin-s-creed-bloodlines-essentials-psp-pal-es", null],
    ["psp-usa-assassin-s-creed-bloodlines-not-for-resale", "/covers/psp/usa-assassin-s-creed-bloodlines-not-for-resale.jpg", "/catalogo/assassin-s-creed-bloodlines-not-for-resale-psp-pal-us", 16.39],
    ["ds-assassin%27s-creed-altair%27s-chronicles", "/covers/ds/assassin-39-s-creed-altair-39-s-chronicles.jpg", "/catalogo/assassin-s-creed-altair-s-chronicles-ds-pal-es", null],
    ["ds-usa-assassins-creed-altair%27s-chronicles", "/covers/ds/assassins-creed-altair-s-chronicles.jpg", "/catalogo/assassins-creed-altair-s-chronicles-ds-pal-us", null],
    ["ds-assassin%27s-creed-ii-discovery", "/covers/ds/assassin-39-s-creed-ii-discovery.jpg", "/catalogo/assassin-s-creed-ii-discovery-ds-pal-es", null],
    ["ds-usa-assassin%27s-creed-ii-discovery", "/covers/ds/assassin-s-creed-ii-discovery.jpg", "/catalogo/assassin-s-creed-ii-discovery-ds-pal-us", null],
  ] as const;
  for (const [id, coverUrl, path, price] of snapshots) {
    const game = getCatalogGame(id);
    assert.ok(game, id);
    assert.equal(game.coverUrl, coverUrl, id);
    assert.equal(catalogGamePath(game), path, id);
    assert.equal(game.recommendedPrice, price, id);
  }
});

test("Liberation Vita keeps national packaging separate from software families", () => {
  const spanish = edition(LIBERATION, "ac3-liberation-vita-standard-es");
  const german = edition(LIBERATION, "ac3-liberation-vita-standard-de");
  const atCh = edition(LIBERATION, "ac3-liberation-vita-standard-at-ch");
  const italian = edition(LIBERATION, "ac3-liberation-vita-standard-it");
  assert.deepEqual([spanish.barcode, german.barcode, atCh.barcode, italian.barcode], [
    "3307215652312", "3307215652282", "3307215652299", "3307215652305",
  ]);
  assert.ok([spanish, german, atCh, italian].every((entry) => entry.softwareFamilyCodes?.includes("PCSB-00074")));
  assert.deepEqual(spanish.packagingLanguages, ["es"]);
  assert.deepEqual(german.packagingLanguages, []);
  assert.deepEqual(atCh.marketRegions, ["AT", "CH"]);

  const generic = edition(LIBERATION, "ac3-liberation-vita-standard-eu-unresolved");
  assert.equal(generic.barcode, "3307215652251");
  assert.deepEqual(generic.marketRegions, []);
  const usa = edition(LIBERATION, "ac3-liberation-vita-standard-us");
  const trilingual = edition(LIBERATION, "ac3-liberation-vita-standard-na-trilingual");
  assert.notEqual(usa.barcode, trilingual.barcode);
  assert.deepEqual(usa.catalogIds, ["psvita-usa-assassin-s-creed-iii-liberation"]);
  assert.deepEqual(trilingual.catalogIds, []);
  assert.deepEqual(trilingual.packagingLanguages, []);
});

test("Lady Liberty and Ubi the Best remain one game but distinct Japanese releases", () => {
  const original = edition(LIBERATION, "ac3-liberation-vita-lady-liberty-jp");
  const budget = edition(LIBERATION, "ac3-liberation-vita-lady-liberty-jp-ubi-the-best");
  assert.deepEqual([original.barcode, original.softwareFamilyCodes, budget.barcode, budget.softwareFamilyCodes], [
    "4949244002769", ["VLJM-35021"], "4949244003438", ["VLJM-35095"],
  ]);
  assert.equal(original.editionType, "STANDARD");
  assert.equal(budget.editionType, "BUDGET_REISSUE");
  assert.equal(guide(LIBERATION).game.aliases?.includes("Assassin's Creed III: Lady Liberty"), true);
  assert.equal(guide(LIBERATION).researchTasks.some((task) => task.id === "liberation-vita-asia-vlas-38019"), true);
  assert.equal(guide(LIBERATION).physicalEditions.some((entry) => entry.softwareFamilyCodes?.includes("VLAS-38019")), false);
});

test("Bloodlines keeps Standard, Essentials, Greatest Hits, Ubi the Best and NFR separate", () => {
  const current = guide(BLOODLINES);
  assert.deepEqual(current.editionFamilies.map((family) => family.id), [
    "standard", "essentials", "bundle-copy-nfr",
  ]);
  const standard = edition(BLOODLINES, "ac-bloodlines-psp-standard-es");
  const essentials = edition(BLOODLINES, "ac-bloodlines-psp-essentials-es");
  assert.equal(standard.barcode, "3307211667679");
  assert.equal(essentials.barcode, "3307215638316");
  assert.equal(essentials.catalogNumber, "ULES-01367/E");
  assert.deepEqual(essentials.packagingLanguages, []);

  const nfr = edition(BLOODLINES, "ac-bloodlines-psp-nfr-us");
  assert.deepEqual(nfr.catalogIds, ["psp-usa-assassin-s-creed-bloodlines-not-for-resale"]);
  assert.match(nfr.notes?.join(" ") ?? "", /No es una edición retail standalone/);
  assert.equal(nfr.editionType, "OTHER");
  assert.equal(edition(BLOODLINES, "ac-bloodlines-psp-greatest-hits-us").barcode, undefined);
});

test("Bloodlines candidate packaging and digital PSN codes are never promoted", () => {
  const english = edition(BLOODLINES, "ac-bloodlines-psp-standard-uk-candidate");
  assert.equal(english.barcode, "3307211667631");
  assert.deepEqual(english.marketRegions, []);
  assert.deepEqual(english.packagingLanguages, []);
  const raw = JSON.stringify(guide(BLOODLINES).physicalEditions);
  assert.equal(raw.includes("NPUH-10032"), false);
  assert.equal(raw.includes("NPEH-00029"), false);
});

test("Altaïr DS joins the preserved ES and US cards without inventing Australia", () => {
  const current = guide(ALTAIRS);
  assert.equal(current.game.aliases?.includes("Assassin's Creed Altair's Chronicles"), true);
  assert.deepEqual(edition(ALTAIRS, "ac-altairs-chronicles-ds-standard-es").productCodes, ["NTR-YAHP-ESP"]);
  assert.deepEqual(edition(ALTAIRS, "ac-altairs-chronicles-ds-standard-us").catalogIds, [
    "ds-usa-assassins-creed-altair%27s-chronicles",
  ]);
  assert.equal(current.physicalEditions.some((entry) => entry.productCodes?.includes("NTR-YAHP-SPA")), false);
  assert.equal(current.physicalEditions.some((entry) => entry.productCodes?.includes("INTR-P-YAHE")), false);
  assert.equal(current.researchTasks.some((task) => task.id === "altairs-ds-australia-packaging"), true);
});

test("Discovery Spain is confirmed while barcode, product code and packaging stay empty", () => {
  const spanish = edition(DISCOVERY, "ac2-discovery-ds-standard-es-pending");
  assert.deepEqual(spanish.marketRegions, ["ES"]);
  assert.equal(spanish.releaseStatus, "RELEASED");
  assert.equal(spanish.confidence, "PENDING_IDENTIFIER");
  assert.equal(spanish.barcode, undefined);
  assert.equal(spanish.catalogNumber, undefined);
  assert.deepEqual(spanish.productCodes, []);
  assert.deepEqual(spanish.packagingLanguages, []);
  assert.deepEqual(spanish.softwareLanguages, ["es", "en"]);
  assert.deepEqual(spanish.catalogIds, ["ds-assassin%27s-creed-ii-discovery"]);
});

test("Discovery candidate EANs remain distinct and territorially unresolved", () => {
  const first = edition(DISCOVERY, "ac2-discovery-ds-standard-eu-3307211667396");
  const second = edition(DISCOVERY, "ac2-discovery-ds-standard-eu-3307211667457");
  assert.deepEqual([first.barcode, second.barcode], ["3307211667396", "3307211667457"]);
  assert.deepEqual(first.marketRegions, []);
  assert.deepEqual(second.marketRegions, []);
  assert.deepEqual(first.productCodes, []);
  assert.deepEqual(second.productCodes, []);
  assert.equal(first.catalogIds.length + second.catalogIds.length, 0);
});

test("portable guides never contain PS3 Liberation HD store identifiers", () => {
  const raw = JSON.stringify(rawGuides);
  for (const digitalCode of ["NPUB-31244", "NPEB-01386", "NPJB-00562"]) {
    assert.equal(raw.includes(digitalCode), false, digitalCode);
  }
});
