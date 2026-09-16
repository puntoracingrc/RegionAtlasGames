import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac3-ps3-worldwide.json";
import research from "../../data/research/ac3-ps3-worldwide-variants-2026-09-15.json";

type RawEdition = {
  id: string;
  label: string;
  editionType: string;
  barcode?: string;
  catalogNumber?: string;
  boxCode?: string;
  softwareFamilyCodes?: string[];
  packagingLanguages?: string[];
  softwareLanguages?: string[];
  catalogIds?: string[];
};

const guide = rawDocument.guides[0];

function editionById(id: string): RawEdition {
  const edition = guide.physicalEditions.find((entry) => entry.id === id) as RawEdition | undefined;
  assert.ok(edition, `missing AC III PS3 edition ${id}`);
  return edition;
}

function editionByBarcode(barcode: string): RawEdition {
  const edition = guide.physicalEditions.find((entry) => "barcode" in entry && entry.barcode === barcode) as RawEdition | undefined;
  assert.ok(edition, `missing AC III PS3 barcode ${barcode}`);
  return edition;
}

test("AC III PS3 overlay declares one canonical work and platform release", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide.id, "assassins-creed-iii-ps3");
  assert.equal(guide.game.canonicalGameId, "assassins-creed-iii");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-iii-ps3");
  assert.equal(guide.game.canonicalCatalogId, "ps3-assassin%27s-creed-iii");
  assert.equal(research.gameId, guide.game.canonicalGameId);
  assert.equal(research.platformReleaseId, guide.game.platformReleaseId);
});

test("core worldwide identifiers remain distinct and exact", () => {
  const expected = new Map([
    ["ac3-ps3-standard-es", ["3307215634646", "BLES-01667"]],
    ["ac3-ps3-standard-fr", ["3307215644812", "BLES-01667"]],
    ["ac3-ps3-standard-us", ["008888347231", "BLUS-30991"]],
    ["ac3-ps3-standard-ca-south-america", ["008888347378", "BLUS-30991L"]],
    ["ac3-ps3-standard-jp", ["4949244002707", "BLJM-60516"]],
    ["ac3-ps3-standard-kr", ["8809182562380", "BLKS-20371"]],
    ["ac3-ps3-standard-asia", ["4895094019221", "BLAS-50494"]],
    ["ac3-ps3-standard-chinese", ["4895094019269", "BLAS-50495"]],
    ["ac3-ps3-washington-asia", ["4895094019429", "BLAS-50583"]],
  ]);
  for (const [id, [barcode, code]] of expected) {
    const edition = editionById(id);
    assert.equal(edition.barcode, barcode);
    const identifiers = [
      edition.catalogNumber,
      edition.boxCode,
      ...(edition.softwareFamilyCodes ?? []),
    ];
    assert.ok(identifiers.includes(code), `${id} missing ${code}`);
  }
  assert.notEqual(editionByBarcode("008888347231").id, editionByBarcode("008888347378").id);
});

test("regional Join or Die boxes are decomposed without a synthetic pan-European barcode", () => {
  const family = guide.editionFamilies.find((entry) => entry.id === "join-or-die");
  assert.ok(family);
  assert.deepEqual(
    family.physicalEditionIds.map((id) => {
      const edition = editionById(id);
      return edition.barcode;
    }),
    ["3307215636848", "3307215636800", "3307215636817", "3307215636756"],
  );
});

test("Australia, Germany, Freedom, Washington and Essentials keep separate physical identities", () => {
  assert.equal(editionByBarcode("3307215643075").id, "ac3-ps3-special-au");
  for (const barcode of ["3307215634578", "3307215642962", "3307215644836"]) {
    assert.ok(editionByBarcode(barcode));
  }
  assert.notEqual(editionByBarcode("3307215636671").id, editionByBarcode("3307215636695").id);
  for (const barcode of ["3307215692646", "3307215692684", "4250114319772"]) {
    assert.ok(editionByBarcode(barcode));
  }
  for (const barcode of ["3307215772423", "3307215772492", "3700664521275"]) {
    assert.ok(editionByBarcode(barcode));
  }
  assert.equal(guide.physicalEditions.some((edition) => "barcode" in edition && edition.barcode === "4012160251983"), false);
});

test("North American retailer editions and reissues are not collapsed into Standard", () => {
  assert.equal(editionByBarcode("008888397236").catalogNumber, "BLUS-30991GS");
  assert.equal(editionByBarcode("008888397373").catalogNumber, "BLUS-30991EBL");
  assert.equal(editionById("ac3-ps3-limited-us").catalogNumber, "BLUS-31035");
  assert.equal(editionById("ac3-ps3-limited-us").barcode, undefined);
  assert.equal(editionById("ac3-ps3-greatest-hits-na").catalogNumber, "BLUS-30991GH");
  assert.equal(editionById("ac3-ps3-greatest-hits-na").barcode, undefined);
  assert.equal(editionById("ac3-ps3-ubiworkshop-us").editionType, "COLLECTOR");
  assert.equal(editionById("ac3-ps3-ubiworkshop-us").barcode, undefined);
});

test("Ubi the Best completes its formerly unknown JAN and release date", () => {
  const ubiTheBest = editionById("ac3-ps3-ubi-the-best-jp") as RawEdition & { releaseDate?: string };
  assert.equal(ubiTheBest.barcode, "4949244003377");
  assert.equal(ubiTheBest.catalogNumber, "BLJM-61171");
  assert.equal(ubiTheBest.releaseDate, "2014-03-20");
  assert.notEqual(ubiTheBest.id, "ac3-ps3-standard-jp");
});

test("software languages never populate packaging languages", () => {
  const russian = editionById("ac3-ps3-standard-ru");
  assert.deepEqual(russian.softwareLanguages, ["pl", "ru", "cs", "hu"]);
  assert.deepEqual(russian.packagingLanguages, []);
  const washington = editionById("ac3-ps3-washington-dfi");
  assert.deepEqual(washington.softwareLanguages, ["de", "en", "fr", "it"]);
  assert.deepEqual(washington.packagingLanguages, []);
  for (const edition of guide.physicalEditions) {
    if (!("packagingLanguages" in edition) || !("softwareLanguages" in edition)) continue;
    assert.notStrictEqual(edition.packagingLanguages, edition.softwareLanguages);
  }
});

test("hardware bundle and digital-only content never count as standalone physical editions", () => {
  assert.equal(research.hardwareBundles.length, 1);
  assert.equal(research.hardwareBundles[0].standalonePhysicalEditionCount, 0);
  assert.equal(guide.physicalEditions.some((edition) => /hardware bundle/i.test(edition.label)), false);
  for (const forbidden of ["Gold Edition", "Ultimate Edition", "Season Pass", "Hidden Secrets", "Battle Hardened", "Infamy", "Betrayal", "Redemption"]) {
    assert.equal(guide.physicalEditions.some((edition) => edition.label.includes(forbidden)), false, forbidden);
  }
  assert.equal(guide.relatedReleases[0].id, "ac3-the-tyranny-of-king-washington");
});

test("physical ids, family membership, catalog ownership and promoted barcodes are unique", () => {
  const editionIds = guide.physicalEditions.map((edition) => edition.id);
  assert.equal(new Set(editionIds).size, editionIds.length);
  const familyMembers = guide.editionFamilies.flatMap((family) => family.physicalEditionIds);
  assert.equal(new Set(familyMembers).size, familyMembers.length);
  assert.deepEqual(new Set(familyMembers), new Set(editionIds));
  const catalogIds = [
    ...guide.physicalEditions.flatMap((edition) => "catalogIds" in edition ? edition.catalogIds ?? [] : []),
    ...(guide.physicalBonusItems as Array<{ catalogIds?: string[] }>).flatMap((item) => item.catalogIds ?? []),
  ];
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  const barcodes = guide.physicalEditions.flatMap((edition) => "barcode" in edition ? [edition.barcode] : []);
  assert.equal(new Set(barcodes).size, barcodes.length);
});

test("preservation boundary is explicit and no redirects are requested", () => {
  assert.equal(research.preservation.catalogJsonModified, false);
  assert.equal(research.preservation.ownedScansModified, false);
  assert.equal(research.preservation.routeRedirectsModified, false);
  assert.equal(research.preservation.priceFilesModified, false);
  assert.equal(research.preservation.rarityFilesModified, false);
});
