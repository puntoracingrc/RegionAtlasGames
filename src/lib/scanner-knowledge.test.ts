import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeScannerPerception } from "./game-scanner";
import { exactScannerCatalogIds, loadScannerKnowledge, scannerDocumentaryKnowledge } from "./scanner-knowledge";

const perception = (title: string, codes: string[] = []) => normalizeScannerPerception({
  title, platformSlug: "ps1", identityConfidence: 0.95,
  observations: [{ photo: 1, component: "game", description: "Disco fotografiado", codes }],
}, 1);
const hasEntry = (entries: { id: string }[], suffix: string) => entries.some((e) => e.id.endsWith(`:${suffix}`));

test("the five pending platforms expose sourced guidance without approving variants or importing reference images", () => {
  for (const [platform, count] of [["ps1", 4], ["dreamcast", 2], ["ds", 3], ["3ds", 3], ["xbox360", 3]] as const) {
    const result = scannerDocumentaryKnowledge(platform, []);
    assert.equal(result.entries.length, count);
    assert.deepEqual(result.knownVariantIds, []);
    const sourceIds = new Set(result.sources.map((s) => s.id));
    assert(result.sources.every((s) => s.url.startsWith("https://foro.spinecard.com/") && s.label.includes("SpineCard")));
    assert(result.entries.every((e) => e.variants.length === 0 && e.sourceIds.every((id) => sourceIds.has(id))));
    const document = JSON.parse(readFileSync(`data/region-research/${platform}.json`, "utf8"));
    for (const image of Object.values(document.imageReferences ?? {}) as { url: string }[]) {
      assert(!JSON.stringify(result).includes(image.url));
    }
  }
});

test("the actual PS1 loader combines V2 editions with only serial-selected SpineCard references", async () => {
  for (const [title, code, reference] of [
    ["Heart of Darkness", "SLES-00465", "ps1-heart-of-darkness-disc-pairs"],
    ["Heart of Darkness", "SLES-00461", "ps1-heart-of-darkness-disc-pairs"],
    ["Ridge Racer", "SCES-00001", "ps1-ridge-racer-printed-language"],
  ]) {
    const observed = perception(title, [code]);
    const before = structuredClone(observed);
    const result = await loadScannerKnowledge("ps1", observed);
    assert(hasEntry(result.entries, reference));
    assert(hasEntry(result.entries, "ps1-disc-and-packaging-codes"));
    assert(hasEntry(result.entries, "component-rules"));
    assert(result.entries.some((e) => e.id.startsWith("ps1-v2:ps1-") && e.text.includes(code)));
    assert.deepEqual(observed, before);
    assert.deepEqual(result.knownVariantIds, []);
    assert.deepEqual(result.examples, []);
    assert.equal(result.knowledge.learningAvailable, false);
  }
  for (const code of ["SLES-00462", "SLES-99999"]) {
    const result = await loadScannerKnowledge("ps1", perception("Heart of Darkness", [code]));
    assert(!hasEntry(result.entries, "ps1-heart-of-darkness-disc-pairs"));
    assert(hasEntry(result.entries, "ps1-disc-and-packaging-codes"));
  }
});

test("rebound comparisons do not leak to old IDs, reissues, other games or platforms", () => {
  for (const id of ["ps1-heart-of-darkness", "ps1-heart-of-darkness-platinum", "ps1-ridge-racer", "ps1-ridge-racer-platinum", "ps1-ridge-racer-revolution"]) {
    const entries = scannerDocumentaryKnowledge("ps1", [id]).entries;
    assert(!hasEntry(entries, "ps1-heart-of-darkness-disc-pairs"));
    assert(!hasEntry(entries, "ps1-ridge-racer-printed-language"));
  }
  const aqua = "dreamcast-aqua-gt-language-combination";
  assert(hasEntry(scannerDocumentaryKnowledge("dreamcast", ["dreamcast-aqua-gt"]).entries, aqua));
  assert(!hasEntry(scannerDocumentaryKnowledge("dreamcast", ["dreamcast-crazy-taxi"]).entries, aqua));
  assert(!hasEntry(scannerDocumentaryKnowledge("ps1", ["dreamcast-aqua-gt"]).entries, aqua));
});

test("mixed or uncertain identities keep general guidance without per-game matches", async () => {
  const catalog = [{ id: "ps1-es-sles-00465", title: "Heart of Darkness", platformSlug: "ps1" }];
  for (const flags of [{ multipleGames: true }, { multiplePlatforms: true }, { identityConflict: true }, { identityConfidence: 0.84 }]) {
    const observed = { ...perception("Heart of Darkness", ["SLES-00465"]), ...flags };
    assert.deepEqual(exactScannerCatalogIds(catalog, observed, "ps1"), []);
    const result = await loadScannerKnowledge("ps1", observed);
    assert(!hasEntry(result.entries, "ps1-heart-of-darkness-disc-pairs"));
    assert(hasEntry(result.entries, "ps1-disc-and-packaging-codes"));
    assert.equal(result.knowledge.exactGameMatches, 0);
  }
});
