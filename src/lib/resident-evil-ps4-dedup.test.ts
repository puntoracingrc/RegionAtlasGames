import assert from "node:assert/strict";
import test from "node:test";
import audit from "../../data/research/resident-evil-ps4-dedup-2026-09-15.json";
import schema from "../../data/schemas/catalog-edition-guides-v2.schema.json";
import { catalog, getCatalogGame, listedCatalog, resolveCatalogIdParam } from "./catalog";
import { getCatalogEditionGuide } from "./catalog-edition-guides";
import { canonicalCatalogId, canonicalCatalogLink } from "./catalog-id-aliases";
import { toCatalogListGame } from "./catalog-list-game";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";
import { catalogGamePath } from "./catalog-path";
import { getCatalogRouteRedirect } from "./catalog-route-redirects";
import { resolveCatalogGameDetailsCatalogId } from "./catalog-runtime-overlay";
import { resolveCatalogGameParam } from "./catalog-url";
import { getCatalogWorkKey } from "./catalog-work";

const retiredVillageId = "ps4-resident-evil-8-village";
const canonicalVillageId = "ps4-resident-evil-village";
const re7Id = "ps4-resident-evil-7-biohazard";
const re7JpId = "ps4-japon-biohazard-7-resident-evil";
const re7GoldId = "ps4-resident-evil-7-biohazard-gold-edition";
const re7GoldJpId = "ps4-japon-biohazard-7-resident-evil-gold-edition";
const re4OriginalId = "ps4-resident-evil-4";
const re4RemakeId = "ps4-resident-evil-4-remake";
const re4GoldId = "ps4-resident-evil-4-gold-edition";
const pendingRe7GoldId = "ps4-japon-biohazard-7-gold";

function requiredGame(id: string) {
  const game = getCatalogGame(id);
  assert.ok(game, `Missing catalog game: ${id}`);
  return game;
}

test("Resident Evil 8 Village resolves to one priced Village catalog entry", () => {
  const canonical = requiredGame(canonicalVillageId);
  assert.equal(getCatalogGame(retiredVillageId), canonical);
  assert.equal(resolveCatalogIdParam(retiredVillageId), canonicalVillageId);
  assert.equal(canonicalCatalogId(retiredVillageId), canonicalVillageId);
  assert.deepEqual(
    listedCatalog
      .filter((game) => [retiredVillageId, canonicalVillageId].includes(game.id))
      .map((game) => game.id),
    [canonicalVillageId],
  );
  assert.equal(canonical.recommendedPrice, 16);
  assert.equal(canonical.pcRefPrice, 31.25);
  assert.equal(canonical.deltaEsVsPc, -48.8);
  assert.equal(canonical.hasEsPrice, true);
  assert.equal(
    canonical.coverUrl,
    getOwnedScanSetById(canonicalVillageId)?.primaryCoverUrl,
  );
  assert.equal(
    getCatalogRouteRedirect("resident-evil-8-village-ps4-pal-es")?.targetParam,
    "resident-evil-village-ps4-pal-es",
  );
  assert.deepEqual(
    canonicalCatalogLink({ catalogId: retiredVillageId, privateCopyId: "copy-1" }),
    { catalogId: canonicalVillageId, privateCopyId: "copy-1" },
  );
});

test("Village V2 keeps regional boxes and historical titles in one searchable game", () => {
  const canonical = requiredGame(canonicalVillageId);
  const guide = getCatalogEditionGuide(canonical);
  assert.ok(guide);
  assert.equal(guide.id, "resident-evil-village-ps4");
  assert.deepEqual(guide.game.aliases, ["Resident Evil 8 Village"]);
  assert.deepEqual(guide.game.regionalTitles, [
    {
      title: "Biohazard Village",
      marketRegions: ["JP"],
      catalogIds: ["ps4-japon-biohazard-village"],
    },
  ]);
  assert.equal(guide.editionFamilies.length, 6);
  assert.equal(guide.physicalEditions.length, 10);

  const source = guide.physicalEditions
    .flatMap((edition) => edition.catalogIds)
    .map((catalogId) => toCatalogListGame(requiredGame(catalogId)));
  const grouped = groupCatalogListGames(source);
  assert.equal(grouped.length, 6);
  const standard = grouped.find((game) => game.id === canonicalVillageId);
  assert.ok(standard);
  assert.match(standard.searchText ?? "", /resident evil 8 village/);
  assert.match(standard.searchText ?? "", /biohazard village/);
});

test("Resident Evil 7 regional titles and Gold boxes share their canonical parent", () => {
  const western = requiredGame(re7Id);
  const japanese = requiredGame(re7JpId);
  assert.equal(getCatalogWorkKey(western.id), getCatalogWorkKey(japanese.id));
  assert.equal(resolveCatalogGameDetailsCatalogId(japanese), re7Id);
  assert.equal(getCatalogEditionGuide(japanese)?.currentEditionFamilyId, "standard");
  assert.deepEqual(getCatalogEditionGuide(japanese)?.game.regionalTitles, [
    {
      title: "Biohazard 7: Resident Evil",
      marketRegions: ["JP"],
      catalogIds: [re7JpId],
    },
  ]);

  const gold = requiredGame(re7GoldId);
  const goldJp = requiredGame(re7GoldJpId);
  for (const game of [gold, goldJp]) {
    const guide = getCatalogEditionGuide(game);
    assert.equal(guide?.id, "resident-evil-7-biohazard-ps4");
    assert.equal(guide?.game.canonicalCatalogId, re7Id);
    assert.equal(guide?.currentEditionFamilyId, "gold");
    assert.equal(resolveCatalogGameDetailsCatalogId(game), re7Id);
  }
});

test("Resident Evil 4 Gold belongs to the Remake and not to the 2016 port", () => {
  const original = requiredGame(re4OriginalId);
  const remake = requiredGame(re4RemakeId);
  const gold = requiredGame(re4GoldId);
  const guide = getCatalogEditionGuide(gold);
  assert.equal(guide?.id, "resident-evil-4-remake-ps4");
  assert.equal(guide?.game.canonicalCatalogId, re4RemakeId);
  assert.equal(guide?.currentEditionFamilyId, "gold");
  assert.equal(resolveCatalogGameDetailsCatalogId(gold), re4RemakeId);
  assert.equal(getCatalogWorkKey(gold.id), getCatalogWorkKey(remake.id));
  assert.notEqual(getCatalogWorkKey(gold.id), getCatalogWorkKey(original.id));
});

test("special editions remain separate catalog and family identities", () => {
  const cases = [
    ["ps4-usa-resident-evil-7-biohazard-collector%27s-edition", "collector"],
    ["ps4-usa-resident-evil-7-biohazard-deluxe-edition", "deluxe"],
    ["ps4-resident-evil-7-steelbook", "steelbook"],
    ["ps4-usa-resident-evil-7-biohazard-playstation-hits", "playstation-hits"],
    ["ps4-japon-biohazard-7-resident-evil-limited-edition", "limited"],
  ] as const;
  for (const [catalogId, familyId] of cases) {
    const game = requiredGame(catalogId);
    assert.equal(canonicalCatalogId(catalogId), catalogId);
    assert.equal(getCatalogEditionGuide(game)?.currentEditionFamilyId, familyId);
  }
});

test("legacy Japanese deep links remain live regional entry points", () => {
  const routes = [
    [re7JpId, "/catalogo/biohazard-7-resident-evil-ps4-pal-jp"],
    [re7GoldJpId, "/catalogo/biohazard-7-resident-evil-gold-edition-ps4-pal-jp"],
  ] as const;
  for (const [catalogId, expectedPath] of routes) {
    const game = requiredGame(catalogId);
    assert.equal(catalogGamePath(game), expectedPath);
    assert.equal(resolveCatalogGameParam(expectedPath.slice("/catalogo/".length))?.id, catalogId);
    assert.equal(resolveCatalogGameDetailsCatalogId(game), re7Id);
  }
});

test("owned scans and the legacy Village cover remain attached to the right variants", () => {
  const scanIds = [
    canonicalVillageId,
    re7GoldId,
    "ps4-resident-evil-4-remake-steelbook",
  ];
  for (const scanId of scanIds) {
    const scanSet = getOwnedScanSetById(scanId);
    assert.ok(scanSet);
    assert.deepEqual(scanSet.images.map((image) => image.role), [
      "portada",
      "contraportada",
      "lomo",
    ]);
  }
  assert.equal(audit.preservation.imageCount, 10);
  assert.equal(audit.preservation.userDataModified, false);
  assert.ok(
    getCatalogEditionGuide(requiredGame(canonicalVillageId))
      ?.physicalEditions.flatMap((edition) => edition.images)
      .some((image) => image.url === "/covers/ps4/resident-evil-8-village.jpg"),
  );
});

test("the unresolved Biohazard 7 Gold candidate stays outside the reviewed merge", () => {
  const pending = catalog.find((game) => game.id === pendingRe7GoldId);
  assert.ok(pending);
  assert.equal(pending.listingStatus, "listed");
  assert.equal(canonicalCatalogId(pending.id), pending.id);
  assert.notEqual(getCatalogWorkKey(pending.id), getCatalogWorkKey(re7Id));
  assert.equal(
    audit.pendingReview.find((entry) => entry.catalogId === pendingRe7GoldId)?.status,
    "PENDING_REVIEW",
  );
});

test("the V2 schema documents game aliases and regional-title relationships", () => {
  const gameProperties = schema.$defs.physicalGuide.properties.game.properties;
  assert.equal(gameProperties.aliases.uniqueItems, true);
  assert.equal(gameProperties.regionalTitles.items.additionalProperties, false);
  assert.deepEqual(gameProperties.regionalTitles.items.required, [
    "title",
    "marketRegions",
    "catalogIds",
  ]);
});
