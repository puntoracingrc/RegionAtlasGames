import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-nintendo.json";

type PhysicalContentStatus =
  | "PHYSICAL_FULL_GAME"
  | "PHYSICAL_DOWNLOAD_REQUIRED"
  | "GAME_KEY_CARD"
  | "CODE_IN_BOX"
  | "COLLECTOR_WITHOUT_GAME"
  | "DIGITAL_ONLY"
  | "CANCELED_PHYSICAL"
  | "UNKNOWN_PHYSICAL_STATUS";

type PhysicalProductType =
  | "NATIVE_GAME_DISC"
  | "NATIVE_GAME_CARD"
  | "GAME_KEY_CARD"
  | "DOWNLOAD_CODE_IN_BOX"
  | "UNKNOWN_PHYSICAL_PRODUCT";

type Edition = {
  id: string;
  label: string;
  editionType: string;
  marketRegions: string[];
  packagingLanguages?: string[];
  barcode?: string;
  boxCode?: string;
  productCodes?: string[];
  physicalContentStatus: PhysicalContentStatus;
  physicalProductType: PhysicalProductType;
  nativePhysicalPlatform?: string;
  compatiblePlatforms: string[];
  containsDisc?: boolean;
  hasGameCard?: boolean;
  gameStoredOnCard?: boolean;
  fullGameDownloadRequired: boolean;
  physicalGameCardCount?: number;
  gameKeyCardCount?: number;
  physicalGameCount: number;
  countsAsNativePhysicalRelease: boolean;
  physicalContents: string[];
  digitalContents: string[];
  catalogIds?: string[];
  confidence?: string;
  evidenceIds: string[];
  notes?: string[];
};

type Guide = {
  id: string;
  note: string;
  game: {
    title: string;
    platformSlug: string;
    canonicalCatalogId: string;
    canonicalGameId: string;
    platformReleaseId: string;
  };
  physicalEditions: Edition[];
  evidence: Array<{ id: string }>;
  evidenceNote: string;
  researchTasks?: Array<{ id: string; label: string; notes?: string[] }>;
};

const document = rawDocument as unknown as { schemaVersion: number; guides: Guide[] };
const guides = new Map(document.guides.map((guide) => [guide.id, guide]));

function guide(id: string): Guide {
  const result = guides.get(id);
  assert.ok(result, `missing Nintendo guide ${id}`);
  return result;
}

function barcodes(target: Guide): string[] {
  return target.physicalEditions.flatMap((edition) => edition.barcode ? [edition.barcode] : []);
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

test("Nintendo overlay keeps six canonical platform releases and stable future Wii U identities", () => {
  assert.equal(document.schemaVersion, 2);
  assert.deepEqual(
    document.guides.map((entry) => [
      entry.id,
      entry.game.platformSlug,
      entry.game.canonicalCatalogId,
      entry.game.platformReleaseId,
    ]),
    [
      ["assassins-creed-iii-remastered-switch-worldwide", "switch", "switch-assassin-s-creed-iii-remastered", "assassins-creed-iii-remastered-switch"],
      ["assassins-creed-rebel-collection-switch-worldwide", "switch", "switch-assassin-s-creed-the-rebel-collection", "assassins-creed-the-rebel-collection-switch"],
      ["assassins-creed-ezio-collection-switch-worldwide", "switch", "switch-assassin-s-creed-the-ezio-collection", "assassins-creed-the-ezio-collection-switch"],
      ["assassins-creed-shadows-switch2-worldwide", "switch2", "switch2-assassin-s-creed-shadows", "assassins-creed-shadows-switch2"],
      ["assassins-creed-iii-wiiu-worldwide", "wiiu", "wiiu-assassin-s-creed-iii", "assassins-creed-iii-wiiu"],
      ["assassins-creed-iv-black-flag-wiiu-worldwide", "wiiu", "wiiu-assassin-s-creed-iv-black-flag", "assassins-creed-iv-black-flag-wiiu"],
    ],
  );
  assert.equal(new Set(document.guides.map((entry) => entry.game.canonicalGameId)).size, 6);
});

test("every documented product has unique identity, source-bound evidence and no invented packaging language", () => {
  const editionIds = document.guides.flatMap((entry) => entry.physicalEditions.map((edition) => edition.id));
  assert.equal(new Set(editionIds).size, editionIds.length);

  for (const target of document.guides) {
    const evidenceIds = new Set(target.evidence.map((entry) => entry.id));
    const targetBarcodes = barcodes(target);
    assert.equal(new Set(targetBarcodes).size, targetBarcodes.length, `${target.id} duplicate barcode`);
    for (const edition of target.physicalEditions) {
      assert.ok(edition.evidenceIds.length > 0, `${edition.id} has no evidence`);
      assert.ok(edition.evidenceIds.every((id) => evidenceIds.has(id)), `${edition.id} references unknown evidence`);
    }
  }

  const withPackagingLanguage = document.guides.flatMap((target) => target.physicalEditions)
    .filter((edition) => (edition.packagingLanguages?.length ?? 0) > 0);
  assert.deepEqual(withPackagingLanguage.map((edition) => ({
    id: edition.id,
    languages: edition.packagingLanguages,
  })), [{ id: "shadows-switch2-be-fr-nl", languages: ["fr", "nl"] }]);
});

test("media taxonomy produces separate non-overlapping counts", () => {
  const totals = document.guides.flatMap((entry) => entry.physicalEditions).reduce(
    (result, edition) => ({
      ...result,
      [edition.physicalContentStatus]: result[edition.physicalContentStatus] + 1,
    }),
    {
      PHYSICAL_FULL_GAME: 0,
      PHYSICAL_DOWNLOAD_REQUIRED: 0,
      GAME_KEY_CARD: 0,
      CODE_IN_BOX: 0,
      COLLECTOR_WITHOUT_GAME: 0,
      DIGITAL_ONLY: 0,
      CANCELED_PHYSICAL: 0,
      UNKNOWN_PHYSICAL_STATUS: 0,
    } satisfies Record<PhysicalContentStatus, number>,
  );

  assert.deepEqual(totals, {
    PHYSICAL_FULL_GAME: 33,
    PHYSICAL_DOWNLOAD_REQUIRED: 23,
    GAME_KEY_CARD: 7,
    CODE_IN_BOX: 8,
    COLLECTOR_WITHOUT_GAME: 0,
    DIGITAL_ONLY: 0,
    CANCELED_PHYSICAL: 0,
    UNKNOWN_PHYSICAL_STATUS: 1,
  });
  assert.equal(document.guides.flatMap((entry) => entry.physicalEditions).length, 72);
  assert.equal(document.guides.flatMap((entry) => entry.physicalEditions).reduce((sum, entry) => sum + entry.physicalGameCount, 0), 56);
});

test("Switch game cards contain real software but preserve required-download content", () => {
  const downloadRequired = document.guides.flatMap((entry) => entry.physicalEditions)
    .filter((edition) => edition.physicalContentStatus === "PHYSICAL_DOWNLOAD_REQUIRED");
  assert.equal(downloadRequired.length, 23);
  for (const edition of downloadRequired) {
    assert.equal(edition.physicalProductType, "NATIVE_GAME_CARD");
    assert.equal(edition.nativePhysicalPlatform, "switch");
    assert.deepEqual(edition.compatiblePlatforms, ["switch", "switch2"]);
    assert.equal(edition.hasGameCard, true);
    assert.equal(edition.gameStoredOnCard, true);
    assert.equal(edition.fullGameDownloadRequired, false);
    assert.equal(edition.physicalGameCardCount, 1);
    assert.equal(edition.gameKeyCardCount, 0);
    assert.equal(edition.physicalGameCount, 1);
    assert.equal(edition.countsAsNativePhysicalRelease, true);
    assert.ok(edition.digitalContents.some((content) => /descarga/i.test(content)));
  }

  const ac3 = guide("assassins-creed-iii-remastered-switch-worldwide").physicalEditions
    .filter((edition) => edition.physicalContentStatus === "PHYSICAL_DOWNLOAD_REQUIRED");
  assert.ok(ac3.every((edition) => edition.physicalContents.includes("Assassin's Creed III Remastered")));
  assert.ok(ac3.every((edition) => edition.physicalContents.includes("Assassin's Creed Liberation Remastered")));
  assert.ok(ac3.every((edition) => edition.digitalContents.some((content) => /DLC de un jugador/i.test(content))));

  const rebel = guide("assassins-creed-rebel-collection-switch-worldwide").physicalEditions
    .filter((edition) => edition.physicalContentStatus === "PHYSICAL_DOWNLOAD_REQUIRED");
  assert.equal(rebel.length, 5);
  assert.ok(rebel.every((edition) => edition.physicalContents.includes("Assassin's Creed IV: Black Flag")));
  assert.ok(rebel.every((edition) => edition.digitalContents.some((content) => /Rogue.*7\.1 GB/i.test(content))));

  const ezio = guide("assassins-creed-ezio-collection-switch-worldwide").physicalEditions
    .filter((edition) => edition.physicalContentStatus === "PHYSICAL_DOWNLOAD_REQUIRED");
  assert.equal(ezio.length, 9);
  assert.ok(ezio.every((edition) => edition.physicalContents.includes("Assassin's Creed II")));
  for (const name of ["Brotherhood", "Revelations", "Lineage", "Embers"]) {
    assert.ok(ezio.every((edition) => edition.digitalContents.some((content) => content.includes(name))));
  }
});

test("code-in-box products have no game card and never contribute a physical game", () => {
  const codeProducts = document.guides.flatMap((entry) => entry.physicalEditions)
    .filter((edition) => edition.physicalContentStatus === "CODE_IN_BOX");
  assert.equal(codeProducts.length, 8);
  assert.deepEqual(sorted(codeProducts.map((edition) => edition.barcode!)), sorted([
    "3307216239970",
    "3307216307303", "3307216283942", "3307216307297",
    "3307216259374", "3307216259336", "3307216259350", "3307216259367",
  ]));
  for (const edition of codeProducts) {
    assert.equal(edition.physicalProductType, "DOWNLOAD_CODE_IN_BOX");
    assert.equal(edition.nativePhysicalPlatform, undefined);
    assert.equal(edition.containsDisc, false);
    assert.equal(edition.hasGameCard, false);
    assert.equal(edition.gameStoredOnCard, false);
    assert.equal(edition.fullGameDownloadRequired, true);
    assert.equal(edition.physicalGameCardCount, 0);
    assert.equal(edition.gameKeyCardCount, 0);
    assert.equal(edition.physicalGameCount, 0);
    assert.equal(edition.countsAsNativePhysicalRelease, false);
  }
});

test("all Shadows Switch 2 boxes are Game-Key Cards with the full game absent from the card", () => {
  const shadows = guide("assassins-creed-shadows-switch2-worldwide");
  assert.deepEqual(sorted(barcodes(shadows)), sorted([
    "3307216307501", "3307216307518", "3307216307129", "3307216307457",
    "3307216307433", "887256117108", "4949244013673",
  ]));
  for (const edition of shadows.physicalEditions) {
    assert.equal(edition.physicalContentStatus, "GAME_KEY_CARD");
    assert.equal(edition.physicalProductType, "GAME_KEY_CARD");
    assert.equal(edition.nativePhysicalPlatform, "switch2");
    assert.deepEqual(edition.compatiblePlatforms, ["switch2"]);
    assert.equal(edition.hasGameCard, true);
    assert.equal(edition.gameStoredOnCard, false);
    assert.equal(edition.fullGameDownloadRequired, true);
    assert.equal(edition.physicalGameCardCount, 0);
    assert.equal(edition.gameKeyCardCount, 1);
    assert.equal(edition.physicalGameCount, 0);
    assert.equal(edition.countsAsNativePhysicalRelease, false);
  }
  assert.equal(document.guides.some((entry) => /black flag resynced/i.test(entry.game.title)), false);
  assert.ok(shadows.evidenceNote.includes("No se crea Black Flag Resynced Switch 2"));
});

test("Wii U contains only the demonstrated physical families", () => {
  const ac3 = guide("assassins-creed-iii-wiiu-worldwide");
  assert.equal(ac3.physicalEditions.filter((edition) => edition.editionType === "STANDARD").length, 9);
  assert.equal(ac3.physicalEditions.filter((edition) => edition.label.startsWith("Join or Die")).length, 4);
  assert.equal(ac3.physicalEditions.some((edition) => /Freedom|Special|Washington/i.test(edition.label)), false);

  const blackFlag = guide("assassins-creed-iv-black-flag-wiiu-worldwide");
  assert.equal(blackFlag.physicalEditions.filter((edition) => edition.label.startsWith("Standard")).length, 8);
  assert.equal(blackFlag.physicalEditions.filter((edition) => edition.label.startsWith("Special Edition")).length, 3);
  assert.equal(blackFlag.physicalEditions.filter((edition) => edition.label.startsWith("Skull Edition")).length, 5);
  assert.equal(blackFlag.physicalEditions.filter((edition) => edition.label.startsWith("Buccaneer Edition")).length, 2);
  assert.equal(blackFlag.physicalEditions.filter((edition) => edition.label.startsWith("Black Chest Edition")).length, 2);
  assert.equal(blackFlag.physicalEditions.some((edition) => /Jackdaw|Freedom Cry/i.test(edition.label)), false);
  assert.equal(blackFlag.physicalEditions.find((edition) => edition.id === "ac4-wiiu-skull-es")?.barcode, undefined);
  assert.equal(blackFlag.physicalEditions.find((edition) => edition.id === "ac4-wiiu-standard-es")?.barcode, "3307215706435");

  for (const edition of [...ac3.physicalEditions, ...blackFlag.physicalEditions]) {
    assert.equal(edition.physicalContentStatus, "PHYSICAL_FULL_GAME");
    assert.equal(edition.physicalProductType, "NATIVE_GAME_DISC");
    assert.equal(edition.nativePhysicalPlatform, "wiiu");
    assert.deepEqual(edition.compatiblePlatforms, ["wiiu"]);
    assert.equal(edition.containsDisc, true);
    assert.equal(edition.fullGameDownloadRequired, false);
    assert.equal(edition.physicalGameCount, 1);
    assert.equal(edition.countsAsNativePhysicalRelease, true);
  }
});

test("regional barcode inventories match the supplied Nintendo dossiers", () => {
  assert.deepEqual(sorted(barcodes(guide("assassins-creed-iii-remastered-switch-worldwide"))), sorted([
    "3307216112037", "3307216111979", "3307216111986", "3307216112006", "3307216111955",
    "3307216111993", "3307216111931", "887256039400", "4949244007177",
  ]));
  assert.deepEqual(sorted(barcodes(guide("assassins-creed-rebel-collection-switch-worldwide"))), sorted([
    "3307216148456", "3307216148364", "887256097677", "3307216148333", "4949244008211",
    "3307216239970", "3307216307303", "3307216283942", "3307216307297",
  ]));
  assert.deepEqual(sorted(barcodes(guide("assassins-creed-ezio-collection-switch-worldwide"))), sorted([
    "3307216220923", "3307216220817", "3307216220855", "3307216220879", "887256111953",
    "887256111960", "4949244012706", "3307216220824", "3307216220916", "3307216259374",
    "3307216259336", "3307216259350", "3307216259367",
  ]));
});

test("provisional variants keep their market unresolved instead of inferring a country", () => {
  const unresolvedBarcodes = new Set([
    "3307216111993",
    "3307216307297",
    "3307216220824",
    "3307216220916",
    "3307216259350",
    "3307216259367",
  ]);
  const unresolved = document.guides.flatMap((entry) => entry.physicalEditions)
    .filter((edition) => edition.barcode && unresolvedBarcodes.has(edition.barcode));
  assert.equal(unresolved.length, unresolvedBarcodes.size);
  assert.ok(unresolved.every((edition) => edition.marketRegions.length === 0));
  assert.ok(unresolved.every((edition) => edition.confidence === "PENDING_IDENTIFIER"));
});

test("eShop releases stay outside physical editions and backward compatibility creates no Switch 2 duplicate", () => {
  assert.ok(document.guides.every((entry) => entry.evidenceNote.includes("DIGITAL_ONLY")));
  assert.equal(
    document.guides.flatMap((entry) => entry.physicalEditions)
      .some((edition) => edition.physicalContentStatus === "DIGITAL_ONLY"),
    false,
  );
  const switchGuides = document.guides.filter((entry) => entry.game.platformSlug === "switch");
  assert.ok(switchGuides.every((entry) => entry.game.platformReleaseId.endsWith("-switch")));
  assert.ok(switchGuides.flatMap((entry) => entry.physicalEditions)
    .filter((edition) => edition.physicalProductType === "NATIVE_GAME_CARD")
    .every((edition) => edition.nativePhysicalPlatform === "switch"));
  assert.equal(
    document.guides.filter((entry) => entry.game.platformSlug === "switch2").map((entry) => entry.game.title).join("|"),
    "Assassin's Creed Shadows",
  );
});

test("catalog ownership is limited to existing Switch identities plus the two authorized Wii U identities", () => {
  const catalogIds = document.guides.flatMap((entry) => entry.physicalEditions)
    .flatMap((edition) => edition.catalogIds ?? []);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  assert.deepEqual(sorted(catalogIds), sorted([
    "switch-assassin-s-creed-iii-remastered",
    "switch-assassin-s-creed-iii-remastered-code-in-box",
    "switch-usa-assassin-s-creed-iii-remastered",
    "switch-assassin-s-creed-the-rebel-collection",
    "switch-usa-assassin-s-creed-the-rebel-collection",
    "switch-assassin-s-creed-the-rebel-collection-code-in-box",
    "switch-assassin-s-creed-the-rebel-collection-ac-3-code-in-box",
    "switch-assassin-s-creed-the-ezio-collection",
    "switch-usa-assassin-s-creed-the-ezio-collection",
    "switch2-assassin-s-creed-shadows",
    "switch2-usa-assassin-s-creed-shadows",
    "wiiu-assassin-s-creed-iii",
    "wiiu-assassin-s-creed-iv-black-flag",
  ]));

  const ac3 = guide("assassins-creed-iii-remastered-switch-worldwide");
  const unresolvedCodeInBox = ac3.physicalEditions.find((edition) =>
    edition.catalogIds?.includes("switch-assassin-s-creed-iii-remastered-code-in-box"),
  );
  assert.equal(unresolvedCodeInBox?.physicalContentStatus, "UNKNOWN_PHYSICAL_STATUS");
  assert.equal(unresolvedCodeInBox?.countsAsNativePhysicalRelease, false);
  assert.ok(ac3.researchTasks?.some((task) => task.id === "ac3r-switch-code-in-box-conflict"));
});
