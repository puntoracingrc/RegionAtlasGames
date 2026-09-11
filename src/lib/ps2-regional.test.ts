import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import reviewedPhotoData from "../../data/ps2-reviewed-market-photos.json";
import { buildCatalogSeoSlug } from "./catalog-path";
import { catalogData } from "./catalog-data";
import { isDefaultCatalogGame, isPendingCatalogGame } from "./catalog-review-policy";
import { mergeCatalogGameWithOverlay } from "./catalog-overlay-merge";
import { normalizeScannerPerception, normalizeScannerReasoning } from "./game-scanner";
import { exactScannerCatalogIds, loadScannerKnowledge } from "./scanner-knowledge";
import { ps2ScannerKnowledge } from "./ps2-scanner-knowledge";
import { ps2DocumentaryByCode } from "./ps2-documentary";
import { getPs2EditionDetails } from "./ps2-edition-data";
import { withReviewedPs2Cover, withReviewedPs2Photos } from "./ps2-reviewed-market-photos";
import { ps2GraphicLabel, type Ps2EditionDetails } from "./ps2-regional";
import { toCatalogListGame } from "./catalog-list-game";
import { matchesQuery } from "./catalog-filters";
import type { CatalogGame } from "./types";

const baseline = JSON.parse(gunzipSync(readFileSync("artifacts/ps2-region-migration/baseline-ps2.json.gz")).toString("utf8")) as { catalog: CatalogGame[] };
const byId = new Map(catalogData.map((g) => [g.id, g]));
const ps2 = catalogData.filter((g) => g.platformSlug === "ps2");
const observation = (title: string, codes: string[]) => normalizeScannerPerception({ title, platformSlug: "ps2", identityConfidence: 0.96,
  observations: [{ photo: 1, component: "game", description: "Disco", codes }] }, 1);
const consult = (title: string, codes: string[]) => {
  const perception = observation(title, codes);
  return ps2ScannerKnowledge(perception, exactScannerCatalogIds(catalogData, perception, "ps2"));
};

test("all 8037 existing PS2 IDs and URLs survive the regional migration", () => {
  assert.equal(baseline.catalog.length, 8037);
  assert.equal(byId.size, catalogData.length);
  for (const before of baseline.catalog) {
    const after = byId.get(before.id)!;
    assert(after, before.id);
    assert.equal(buildCatalogSeoSlug(after), buildCatalogSeoSlug(before), before.id);
    assert.equal(after.slug, before.slug, before.id);
  }
  const urls = ps2.map(buildCatalogSeoSlug);
  assert.equal(new Set(urls).size, urls.length);
});
test("pending PS2 entries keep profiles and are excluded from default navigation", () => {
  for (const game of ps2) {
    const profile = getPs2EditionDetails(game.id)!;
    assert(profile, game.id);
    assert.equal(profile.physicalVariantResolved, false);
    if (game.regionalStatus !== "review") continue;
    assert(isPendingCatalogGame(game));
    assert(!isDefaultCatalogGame(game));
    assert(profile.reviewReasons.length, game.id);
    assert.equal(game.marketRegion, null);
    assert.equal(game.coverUrl, null);
    assert.equal(game.priceRegionVerified, false);
  }
});
test("old overlay cannot restore provisional Spain, an old cover or a price to a moved PS2 record", () => {
  const before = baseline.catalog.find((g) => g.id === "ps2-hack-infection")!;
  const after = byId.get(before.id)!;
  assert.equal(after.region, "PAL Europa");
  const merged = mergeCatalogGameWithOverlay(after, { ...before, recommendedPrice: 999, priceRegionVerified: true });
  assert.equal(merged.region, after.region);
  assert.equal(merged.canonicalSeoSlug, after.canonicalSeoSlug);
  assert.equal(merged.coverUrl, after.coverUrl);
  assert.notEqual(merged.recommendedPrice, 999);
});
test("Final Fantasy X keeps Spanish text, English voice and normal/Platinum uncertainty", () => {
  assert.equal(ps2DocumentaryByCode("SCES-50494")[0].record.languages.discrepancy, false);
  const result = consult("Final Fantasy X", ["SCES50494"]);
  assert.equal(result.consultedIds.length, 1);
  const text = result.entries.map((e) => e.text).join(" ");
  assert.match(text, /Textos y menús: Español\. Voces: Inglés/);
  assert.match(text, /711719360520/);
  assert.match(text, /711719468929/);
  assert.deepEqual(result.knownVariantIds, []);
  assert(result.entries.every((e) => !e.variants.length));
});
test("catalog search finds documented PS2 disc codes with or without a hyphen", () => {
  const game = ps2.find((g) => g.canonicalSerials?.includes("SCES-50494"))!;
  const listing = toCatalogListGame(game);
  assert(matchesQuery(listing, "SCES-50494"));
  assert(matchesQuery(listing, "SCES50494"));
});
test("a source date before the PS2 launch stays documentary and cannot become the release date", () => {
  const profile = getPs2EditionDetails("ps2-japon-sorcerous-stabber-orphen")!;
  assert.equal(profile.regionalReleaseDate?.iso, null);
  assert(profile.regionalReleaseDate?.raw.includes("1999"));
  assert(profile.sourceWarnings?.includes("release_date_precedes_ps2_retail_launch"));
  const record = ps2DocumentaryByCode(profile.components[0].serial)[0].record;
  assert.match(consult(record.title, [profile.components[0].serial]).entries.at(-1)!.text, /No usarla como fecha de lanzamiento/);
});
test("Korean Persona 3 remains Korea and exposes the language contradiction", () => {
  const record = ps2DocumentaryByCode("SCKA-20099")[0].record;
  assert.equal(record.market?.code, "KR");
  assert(record.languages.discrepancy);
  const result = consult("Persona 3", ["SCKA-20099"]);
  assert.equal(result.consultedIds.length, 1);
  assert.match(result.entries.at(-1)!.text, /NTSC-J Corea/);
  assert.match(result.entries.at(-1)!.text, /contradicción/);
});
test("commercial SKU stays literal and an accessory is not promoted to a disc serial", () => {
  for (const code of ["PERSONA-01", "GN-06017"]) {
    const records = ps2DocumentaryByCode(code);
    assert(records.length);
    assert(records.every(({ record }) => record.codes.includes(code) && !record.physicalVariantResolved));
  }
  const accessory = ps2DocumentaryByCode("SLEH-00049");
  assert(accessory.length);
  assert(accessory.every((r) => r.role === "accessory_code"));
  assert.equal(consult("Guitar Hero", ["SLEH-00049"]).consultedIds.length, 0);
});
test("a Platinum barcode retrieves its packaging scope without asserting a physical variant", () => {
  const found = ps2DocumentaryByCode("711719468929");
  assert(found.some(({ record, role }) => role === "barcode_reference" && record.codes.includes("SCES-50494")));
  assert.equal(ps2DocumentaryByCode("0711719468929").length, 0);
  const result = consult("Final Fantasy X", ["711719468929"]);
  assert.match(result.entries.at(-1)!.text, /packaging_scan; presentación Platinum/);
  assert.deepEqual(result.knownVariantIds, []);
});
test("documentary lookup rejects wrong game, unknown suffix and conflicted photo identity", () => {
  assert.equal(consult("Final Fantasy X", ["SCES-50494-UNKNOWN"]).consultedIds.length, 0);
  assert.equal(consult("Final Fantasy XII", ["SCES-50494"]).consultedIds.length, 0);
  const p = { ...observation("Final Fantasy X", ["SCES-50494"]), identityConflict: true };
  const before = structuredClone(p);
  assert.equal(ps2ScannerKnowledge(p, ["ps2-final-fantasy-x"]).consultedIds.length, 0);
  assert.deepEqual(p, before);
});
test("PS2 loader activates V2 evidence after perception without legacy learned examples", async () => {
  const p = observation("Final Fantasy X", ["SCES-50494"]);
  const result = await loadScannerKnowledge("ps2", p);
  assert(result.entries.some((e) => e.id.startsWith("ps2-v2:")));
  assert.equal(result.knowledge.exactGameMatches, 1);
  assert.equal(result.knowledge.learningAvailable, false);
  assert.deepEqual(result.examples, []);
});
test("new markets still require a cited photo observation", () => {
  const p = observation("Persona 3", ["SCKA-20099"]);
  const source = { id: "source", url: "https://redump.info/disc/93956/", label: "Redump", reviewedAt: "2026-09-11" };
  const input = { region: { value: "NTSC-J Corea", observationIds: ["o1"], sourceIds: ["source"] } };
  assert.equal(normalizeScannerReasoning(input, p, [source], "ps2").region.value, "NTSC-J Corea");
  assert.equal(normalizeScannerReasoning({ region: { ...input.region, observationIds: [] } }, p, [source], "ps2").region.value, null);
});

test("reviewed eBay batches fill exactly 22 missing covers without changing identities or the historical catalog", () => {
  const raw = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogGame[];
  const changed: string[] = [];
  for (const before of raw) {
    const after = byId.get(before.id)!;
    assert.deepEqual({ ...after, coverUrl: before.coverUrl }, before, before.id);
    if (before.coverUrl === after.coverUrl) continue;
    assert.equal(before.coverUrl, null);
    assert(["ES", "IT", "AU"].includes(before.regionCode!));
    assert.equal(before.edition, "standard");
    changed.push(before.id);
  }
  assert.deepEqual(changed.sort(), [
    "ps2-es-sces-54500", "ps2-es-sles-51665", "ps2-es-sles-52175", "ps2-es-sles-52373", "ps2-es-sles-53224",
    "ps2-es-sces-50971", "ps2-es-sles-53498", "ps2-es-sles-53575", "ps2-es-sles-53987", "ps2-es-sles-50471",
    "ps2-es-sles-51195", "ps2-es-sles-52136", "ps2-es-sles-54235", "ps2-es-sles-52282", "ps2-es-sles-52697",
    "ps2-es-sles-55001", "ps2-es-sles-53581", "ps2-es-sles-54251", "ps2-es-sles-54933", "ps2-es-sles-55337",
    "ps2-it-sles-54883", "ps2-au-sles-53058",
  ].sort());
  for (const id of ["ps2-es-sces-53884", "ps2-es-sles-50016", "ps2-es-sles-51027", "ps2-es-sles-51461", "ps2-es-sles-50026"]) assert.equal(byId.get(id)?.coverUrl, null);
});

test("reviewed covers fail closed if the catalog edition, region, URL or serial changes", () => {
  const original = byId.get("ps2-es-sces-54500")!;
  const blank = { ...original, coverUrl: null };
  for (const patch of [
    { platformSlug: "ps1" }, { regionCode: "PT" }, { marketRegion: "Portugal" }, { edition: "platinum" },
    { canonicalSeoSlug: "different-edition" }, { canonicalSerials: ["SCES-54501"] },
    { regionalStatus: "review" as const }, { coverUrl: "/covers/ps2/already-reviewed.webp" },
  ]) {
    const game = { ...blank, ...patch };
    assert.equal(withReviewedPs2Cover(game), game);
  }
});

test("all 48 published photos retain the original bytes, source and explicit photograph labels", () => {
  type ReviewedGraphic = (typeof reviewedPhotoData.games)[keyof typeof reviewedPhotoData.games]["graphics"][number];
  const photos = Object.values(reviewedPhotoData.games).flatMap<ReviewedGraphic>(set => set.graphics);
  assert.equal(photos.length, 48);
  for (const photo of photos) {
    assert.match(photo.url, /^\/catalog-covers\/ps2\/fotos-verificadas\/[a-z0-9-]+\.webp$/);
    assert.match(photo.sourceUrl, /^https:\/\/www\.ebay\.es\/itm\/\d+(?:\?var=\d+)?$/);
    assert.match(photo.sourceImageReference, /^https:\/\/i\.ebayimg\.com\//);
    assert.equal(photo.marketHints.length, 1);
    assert(["ES", "IT", "AU"].includes(photo.marketHints[0]));
    assert.equal(photo.physicalPairingVerified, false);
    assert(Math.min(photo.width, photo.height) >= 600 && Math.max(photo.width, photo.height) >= 700);
    assert.equal(createHash("sha256").update(readFileSync(`public${photo.url}`)).digest("hex"), photo.sha256);
    assert.match(ps2GraphicLabel(photo), /^Fotografía/);
    if (photo.layout === "listing_packaging_photo") assert.equal(ps2GraphicLabel(photo), "Fotografía de portada y contraportada");
  }
});

test("photo evidence appends to 24 exact profiles without promoting software, dates or factory authenticity", () => {
  assert.equal(Object.keys(reviewedPhotoData.games).length, 24);
  const archive = JSON.parse(gunzipSync(readFileSync("data/ps2-edition-evidence.json.gz")).toString("utf8")) as Record<string, Ps2EditionDetails>;
  for (const [id, set] of Object.entries(reviewedPhotoData.games)) {
    const before = archive[id];
    const after = getPs2EditionDetails(id)!;
    assert.equal(after.graphics.length, before.graphics.length + set.graphics.length);
    for (const key of ["languages", "regionalReleaseDate", "components", "physicalVariantResolved", "status"] as const) {
      assert.deepEqual(after[key], before[key], `${id}:${key}`);
    }
    assert.deepEqual(after.fieldProvenance.market, before.fieldProvenance.market);
    assert.equal(after.physicalVariantResolved, false);
    assert.deepEqual(withReviewedPs2Photos(id, after), after, "repeat loads must not duplicate photos");
  }
  const id = "ps2-es-sces-54500";
  for (const bad of [
    { ...archive[id], status: "review" as const },
    { ...archive[id], components: [{ ...archive[id].components[0], serial: "SCES-54501" }] },
    { ...archive[id], fieldProvenance: { ...archive[id].fieldProvenance, market: { ...archive[id].fieldProvenance.market, value: "Portugal" } } },
  ]) assert.equal(withReviewedPs2Photos(id, bad as Ps2EditionDetails), bad);
});

test("Italian packaging photos stay Italian and observed codes are not invented from the catalog", () => {
  const set = reviewedPhotoData.games["ps2-it-sles-54883"];
  const game = byId.get("ps2-it-sles-54883")!;
  assert(game.coverUrl?.includes("alone-in-the-dark-sles-54883-ps2-pal-it"));
  assert.deepEqual(set.identity.canonicalSerials, ["SLES-54883"]);
  assert(set.graphics.every(photo => photo.marketHints.join() === "IT"));
  assert(set.graphics.every(photo => photo.visualObservation.serials.length === 0));
  const wrongMarket = { ...game, coverUrl: null, regionCode: "ES", marketRegion: "Spain" };
  assert.equal(withReviewedPs2Cover(wrongMarket), wrongMarket);
});

test("component photos remain gallery-only while Bratz keeps its original combined photograph", () => {
  for (const id of ["ps2-es-sces-53884", "ps2-es-sles-51027"] as const) {
    const set = reviewedPhotoData.games[id];
    assert.equal(set.primaryAssetId, null);
    assert(set.graphics.length > 0);
    assert.equal(byId.get(id)?.coverUrl, null);
  }
  const bratz = reviewedPhotoData.games["ps2-es-sles-53575"];
  assert.equal(bratz.graphics.length, 3);
  assert(bratz.graphics.some(photo => photo.layout === "listing_packaging_photo"));
  assert(bratz.primaryAssetId?.includes("227134458655"));
  assert.match(reviewedPhotoData.games["ps2-es-sles-54235"].findings[0].observation, /voces en inglés/);
  assert.match(reviewedPhotoData.games["ps2-es-sles-54933"].findings[0].observation, /banderas.*FIBA.*no son prueba/);
});
