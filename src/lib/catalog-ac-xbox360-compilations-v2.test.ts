import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type RawEdition = {
  id: string;
  barcode?: string;
  boxCode?: string;
  productCodes?: string[];
  serial?: string;
  marketRegions?: string[];
  evidenceMarkets?: string[];
  packagingLanguages?: string[];
  softwareLanguages?: string[];
  physicalContents?: string[];
  digitalContents?: string[];
  containsCatalogIds?: string[];
  catalogIds?: string[];
  evidenceIds?: string[];
  releaseStatus?: string;
  notes?: string[];
};

type RawGuide = {
  id: string;
  game: {
    platformSlug: string;
    canonicalCatalogId: string;
    canonicalGameId?: string;
    platformReleaseId?: string;
  };
  physicalEditions: RawEdition[];
  sharedDiscs?: Array<{ id: string; label: string; serial?: string; evidenceIds?: string[] }>;
  evidence: Array<{ id: string }>;
  evidenceNote: string;
  researchTasks?: Array<{ id: string; status: string }>;
};

type RawDocument = {
  schemaVersion: number;
  guides: RawGuide[];
};

const rawDocument = JSON.parse(
  readFileSync(new URL("../../data/catalog-edition-guides-ac-xbox360-compilations.json", import.meta.url), "utf8"),
) as RawDocument;

function guide(id: string): RawGuide {
  const result = rawDocument.guides.find((entry) => entry.id === id);
  assert.ok(result, `missing guide ${id}`);
  return result;
}

function edition(guideId: string, editionId: string): RawEdition {
  const result = guide(guideId).physicalEditions.find((entry) => entry.id === editionId);
  assert.ok(result, `missing edition ${guideId}/${editionId}`);
  return result;
}

function barcodes(guideId: string): string[] {
  return guide(guideId).physicalEditions.flatMap((entry) => entry.barcode ? [entry.barcode] : []);
}

test("the document contains seven independent Xbox 360 compilation identities", () => {
  assert.equal(rawDocument.schemaVersion, 2);
  assert.equal(rawDocument.guides.length, 7);
  assert.equal(new Set(rawDocument.guides.map((entry) => entry.id)).size, 7);
  assert.equal(new Set(rawDocument.guides.map((entry) => entry.game.canonicalCatalogId)).size, 7);
  assert.equal(new Set(rawDocument.guides.map((entry) => entry.game.canonicalGameId)).size, 7);
  assert.equal(new Set(rawDocument.guides.map((entry) => entry.game.platformReleaseId)).size, 7);
  assert.ok(rawDocument.guides.every((entry) => entry.game.platformSlug === "xbox360"));

  for (const entry of rawDocument.guides) {
    const linked = entry.physicalEditions.flatMap((candidate) => candidate.catalogIds ?? []);
    assert.equal(linked.filter((catalogId) => catalogId === entry.game.canonicalCatalogId).length, 1);
  }

  assert.equal(rawDocument.guides.flatMap((entry) => entry.physicalEditions).length, 25);
  assert.equal(rawDocument.guides.flatMap((entry) => entry.physicalEditions).filter((entry) => entry.barcode).length, 22);
});

test("edition, evidence and research identifiers are internally unique and resolvable", () => {
  const allBarcodes: string[] = [];
  for (const entry of rawDocument.guides) {
    const editionIds = entry.physicalEditions.map((candidate) => candidate.id);
    const evidenceIds = entry.evidence.map((candidate) => candidate.id);
    const researchIds = (entry.researchTasks ?? []).map((candidate) => candidate.id);
    assert.equal(new Set(editionIds).size, editionIds.length, `${entry.id} edition ids`);
    assert.equal(new Set(evidenceIds).size, evidenceIds.length, `${entry.id} evidence ids`);
    assert.equal(new Set(researchIds).size, researchIds.length, `${entry.id} research ids`);

    const evidenceSet = new Set(evidenceIds);
    const referencedEvidence = [
      ...entry.physicalEditions.flatMap((candidate) => candidate.evidenceIds ?? []),
      ...(entry.sharedDiscs ?? []).flatMap((candidate) => candidate.evidenceIds ?? []),
    ];
    for (const evidenceId of referencedEvidence) {
      assert.ok(evidenceSet.has(evidenceId), `${entry.id} missing evidence ${evidenceId}`);
    }
    allBarcodes.push(...entry.physicalEditions.flatMap((candidate) => candidate.barcode ? [candidate.barcode] : []));
  }
  assert.equal(new Set(allBarcodes).size, allBarcodes.length);
});

test("the regional barcode inventory matches the seven supplied dossiers", () => {
  assert.deepEqual(barcodes("assassins-creed-anthology-xbox360"), [
    "3307215678824",
    "3307215678916",
    "3307215678923",
    "3307215678862",
    "3307215678954",
  ]);
  assert.deepEqual(barcodes("assassins-creed-heritage-collection-xbox360"), [
    "3307215760420",
    "3307215760369",
    "3307215760383",
    "3307215760390",
    "3307215760437",
  ]);
  assert.deepEqual(barcodes("assassins-creed-double-pack-xbox360"), [
    "3307215624517",
    "3307215624470",
    "4949244002745",
  ]);
  assert.deepEqual(barcodes("assassins-creed-brotherhood-revelations-double-pack-xbox360"), [
    "3307215689271",
  ]);
  assert.deepEqual(barcodes("assassins-creed-ezio-trilogy-saga-xbox360"), [
    "008888528838",
    "4949244002820",
  ]);
  assert.deepEqual(barcodes("assassins-creed-american-saga-americas-collection-xbox360"), [
    "3307215802779",
    "3307215802786",
    "3307215802755",
    "887256000622",
  ]);
  assert.deepEqual(barcodes("assassins-creed-black-flag-rogue-double-pack-xbox360"), [
    "3307215889947",
    "3307215889961",
  ]);
});

test("PS3 identifiers and disputed standalone codes never become Xbox 360 edition identifiers", () => {
  const editions = rawDocument.guides.flatMap((entry) => entry.physicalEditions);
  const identityValues = editions.flatMap((entry) => [
    entry.barcode,
    entry.boxCode,
    entry.serial,
    ...(entry.productCodes ?? []),
  ]).filter((value): value is string => Boolean(value));
  const forbidden = [
    "3307215760291",
    "4895094019870",
    "4949244002752",
    "3307215689165",
    "3307215693865",
    "3307215673393",
    "4949244002813",
    "887256000615",
    "3307215802496",
    "3307215802816",
    "3307215888858",
  ];

  for (const value of forbidden) assert.equal(identityValues.includes(value), false, value);
  assert.equal(identityValues.some((value) => /\b(?:BLES|BLUS|BLJM|BLAS)-?\d+/i.test(value)), false);
});

test("outer-packaging candidates do not acquire national markets or packaging languages", () => {
  const candidates = [
    edition("assassins-creed-anthology-xbox360", "ac-anthology-xbox360-pal-3307215678862"),
    edition("assassins-creed-anthology-xbox360", "ac-anthology-xbox360-es-candidate"),
    edition("assassins-creed-brotherhood-revelations-double-pack-xbox360", "ac-brotherhood-revelations-double-pack-xbox360-uk-pal-candidate"),
    edition("assassins-creed-american-saga-americas-collection-xbox360", "ac-american-saga-xbox360-pal-3307215802786"),
    edition("assassins-creed-american-saga-americas-collection-xbox360", "ac-american-saga-xbox360-dfi-ch-candidate"),
    edition("assassins-creed-black-flag-rogue-double-pack-xbox360", "ac-black-flag-rogue-double-pack-xbox360-pt-pal"),
  ];

  assert.ok(candidates.every((entry) => (entry.marketRegions ?? []).length === 0));
  assert.ok(candidates.every((entry) => (entry.packagingLanguages ?? []).length === 0));
  assert.deepEqual(edition("assassins-creed-anthology-xbox360", "ac-anthology-xbox360-at-ch").packagingLanguages, ["de"]);
  assert.deepEqual(edition("assassins-creed-american-saga-americas-collection-xbox360", "ac-american-saga-xbox360-dfi-ch-candidate").softwareLanguages, ["de", "en", "fr", "it"]);
  assert.deepEqual(edition("assassins-creed-heritage-collection-xbox360", "ac-heritage-xbox360-es").packagingLanguages ?? [], []);
  assert.deepEqual(
    edition("assassins-creed-black-flag-rogue-double-pack-xbox360", "ac-black-flag-rogue-double-pack-xbox360-nz-oceania").marketRegions,
    ["NZ"],
  );
  assert.deepEqual(
    edition("assassins-creed-black-flag-rogue-double-pack-xbox360", "ac-black-flag-rogue-double-pack-xbox360-nz-oceania").packagingLanguages ?? [],
    [],
  );

  const editionsWithPackagingLanguage = rawDocument.guides
    .flatMap((entry) => entry.physicalEditions)
    .filter((entry) => (entry.packagingLanguages ?? []).length > 0);
  assert.deepEqual(editionsWithPackagingLanguage.map((entry) => entry.id), ["ac-anthology-xbox360-at-ch"]);
});

test("Liberation HD is included only as a digital voucher and never as a catalogued physical game", () => {
  const americanSaga = guide("assassins-creed-american-saga-americas-collection-xbox360");
  for (const entry of americanSaga.physicalEditions) {
    assert.equal(entry.containsCatalogIds?.includes("xbox360-assassin-s-creed-liberation-hd"), false);
    assert.ok(entry.digitalContents?.some((value) => /Liberation HD.*voucher.*no disco/i.test(value)));
    assert.equal(entry.physicalContents?.some((value) => /Liberation HD/i.test(value)), false);
  }
  assert.equal(americanSaga.sharedDiscs?.some((entry) => /Liberation/i.test(entry.label)), false);
  assert.match(americanSaga.evidenceNote, /sólo en digitalContents como voucher/);
});

test("Ezio Trilogy remains USA and Japan only with no invented European variant", () => {
  const ezio = guide("assassins-creed-ezio-trilogy-saga-xbox360");
  assert.deepEqual(ezio.physicalEditions.map((entry) => entry.marketRegions), [["US"], ["JP"]]);
  assert.equal(ezio.physicalEditions.some((entry) => entry.id.includes("eu") || entry.id.includes("europe")), false);
  assert.equal(ezio.physicalEditions.some((entry) => /limited-complete/i.test(entry.id)), false);
  assert.ok(ezio.researchTasks?.some((entry) => (
    entry.id === "ac-ezio-europe-not-confirmed" && entry.status === "PHYSICAL_VARIANT_NOT_CONFIRMED"
  )));
});

test("the stable IncludedGame dependencies are explicit without touching individual-game files", () => {
  const includedIds = new Set(
    rawDocument.guides.flatMap((entry) => entry.physicalEditions.flatMap((candidate) => candidate.containsCatalogIds ?? [])),
  );
  assert.deepEqual([...includedIds].sort(), [
    "xbox360-assassin-s-creed",
    "xbox360-assassin-s-creed-brotherhood",
    "xbox360-assassin-s-creed-ii",
    "xbox360-assassin-s-creed-iii",
    "xbox360-assassin-s-creed-iv-black-flag",
    "xbox360-assassin-s-creed-revelations",
    "xbox360-assassin-s-creed-rogue",
  ]);
  assert.match(guide("assassins-creed-anthology-xbox360").evidenceNote, /integración central/);
  assert.match(guide("assassins-creed-heritage-collection-xbox360").evidenceNote, /fila canónica central/);
});

test("partial disc evidence stays partial until the central PhysicalMedium contract exists", () => {
  const sharedDiscs = rawDocument.guides.flatMap((entry) => entry.sharedDiscs ?? []);
  assert.deepEqual(sharedDiscs.map((entry) => entry.id).sort(), [
    "ac-black-flag-xbox360-americas-disc-family",
    "ac-brotherhood-xbox360-ezio-family-disc",
    "ac-brotherhood-xbox360-heritage-family-disc",
    "ac2-xbox360-goty-classics-heritage-disc",
  ]);
  assert.ok(sharedDiscs.some((entry) => entry.serial?.includes("7A2F4667")));
  assert.ok(sharedDiscs.some((entry) => entry.serial?.includes("6D88AE4F")));
  assert.ok(sharedDiscs.some((entry) => entry.serial?.includes("US224201W05F12") && entry.serial.includes("68EC85BF")));
  assert.equal(
    rawDocument.guides.flatMap((entry) => entry.physicalEditions).some((entry) => "sharedDiscId" in entry),
    false,
  );
});

test("Black Flag plus Rogue is released but inherits no unproven DLC", () => {
  const doublePack = guide("assassins-creed-black-flag-rogue-double-pack-xbox360");
  assert.ok(doublePack.physicalEditions.every((entry) => entry.releaseStatus === "RELEASED"));
  assert.ok(doublePack.physicalEditions.every((entry) => (entry.digitalContents ?? []).length === 0));
  assert.ok(doublePack.physicalEditions.every((entry) => (
    entry.containsCatalogIds?.join("|") === "xbox360-assassin-s-creed-iv-black-flag|xbox360-assassin-s-creed-rogue"
  )));
  assert.match(doublePack.evidenceNote, /pese a la ficha Unreleased/);
});
