import assert from "node:assert/strict";
import test from "node:test";
import { mergeScannerPerceptions, normalizeScannerPerception, normalizeScannerReasoning, scannerInterpretationSkipReason, SCANNER_SKIP_LABELS, type ScannerSource } from "./game-scanner";
import { exactScannerCatalogIds, scannerDocumentaryKnowledge, scannerUsageFromResponse } from "./scanner-knowledge";

const observation = { photo: 1, component: "game", description: "Cartucho", codes: ["DMG-ESP"], texts: [], languages: ["en"], distributors: [] };
const perception = normalizeScannerPerception({ title: "Tetris", platformSlug: "gameboy", identityConfidence: 0.95, observations: [observation, { ...observation, component: "manual", languages: ["es"] }] }, 1);
const sources: ScannerSource[] = [{ id: "documented", url: "https://example.org/documented", label: "Documental", reviewedAt: "2026-09-08" }];

test("several components of the same photo survive; exact duplicates do not", () => {
  const parsed = normalizeScannerPerception({ observations: [observation, observation, { ...observation, component: "manual" }] }, 1);
  assert.equal(parsed.observations.length, 2);
  assert.deepEqual(parsed.observations.map((o) => o.id), ["o1", "o2"]);
});
test("rejects invented photo indexes and invalid component values", () => {
  const parsed = normalizeScannerPerception({ observations: [observation, { ...observation, photo: 7 }, { ...observation, photo: 0 }, { ...observation, photo: 1.5 }, { ...observation, component: "reference" }] }, 6);
  assert.equal(parsed.observations.length, 1);
});
test("invalid confidence is unknown, not silently upgraded", () => {
  for (const confidence of [NaN, Infinity, "1", 1.5, -1, undefined]) assert.equal(normalizeScannerPerception({ identityConfidence: confidence }, 1).identityConfidence, 0);
});
test("region needs current photo evidence, not a hint or reference alone", () => {
  const result = normalizeScannerReasoning({ region: { value: "PAL España", observationIds: ["hint", "reference-photo"], sourceIds: ["documented"] } }, perception, sources, "gameboy");
  assert.equal(result.region.value, null);
});
test("positive observed evidence may recognize a regional market", () => {
  const result = normalizeScannerReasoning({ region: { value: "PAL Italia", observationIds: ["o1"], sourceIds: ["invented", "documented"] } }, perception, sources, "gameboy");
  assert.equal(result.region.value, "PAL Italia");
  assert.deepEqual(result.region.sourceIds, ["documented"]);
});
test("wrong or unknown platform cannot receive a region", () => {
  assert.equal(normalizeScannerReasoning({ region: { value: "PAL España", observationIds: ["o1"] } }, perception, sources, "snes").region.value, null);
});
test("different languages alone cannot confirm Frankenstein or original pairing", () => {
  for (const status of ["compatible", "possible_mismatch"]) {
    const result = normalizeScannerReasoning({ composition: { status, observationIds: ["o1", "o2"], sourceIds: ["documented"], variantId: "imagined" } }, perception, sources, "gameboy");
    assert.equal(result.composition.status, "unknown");
  }
});
test("documented pairing with multiple visible components remains representable", () => {
  const result = normalizeScannerReasoning({ composition: { status: "compatible", observationIds: ["o1", "o2"], sourceIds: ["documented"], variantId: "v1" } }, perception, sources, "gameboy", ["v1"]);
  assert.equal(result.composition.status, "compatible");
});
test("closed box alone cannot confirm an original complete set", () => {
  const single = normalizeScannerPerception({ platformSlug: "gameboy", observations: [{ ...observation, component: "box" }] }, 1);
  assert.equal(normalizeScannerReasoning({ composition: { status: "compatible", observationIds: ["o1"], sourceIds: ["documented"], variantId: "v1" } }, single, sources, "gameboy", ["v1"]).composition.status, "unknown");
});
test("findings cannot cite photos outside the current scan", () => {
  assert.equal(normalizeScannerReasoning({ findings: [{ label: "invented", observationIds: ["o9"] }] }, perception, sources, "gameboy").findings.length, 0);
});
test("catalog lookup is exact, platform scoped and cannot derive a sequel from a prefix", () => {
  const rows = [{ id: "gb", title: "Tetris", platformSlug: "gameboy" }, { id: "snes", title: "Tetris", platformSlug: "snes" }, { id: "sequel", title: "Tetris 2", platformSlug: "gameboy" }, { id: "hidden", title: "Tetris", platformSlug: "gameboy", listingStatus: "excluded" }];
  assert.deepEqual(exactScannerCatalogIds(rows, perception, "gameboy"), ["gb"]);
  assert.deepEqual(exactScannerCatalogIds(rows, { ...perception, identityConfidence: 0.5 }, "gameboy"), []);
});
test("uses the collectors' shared documentary guidance and exact game references", () => {
  const general = scannerDocumentaryKnowledge("gameboy", []);
  const tetris = scannerDocumentaryKnowledge("gameboy", ["gameboy-tetris"]);
  assert.ok(general.entries.length > 0);
  assert.ok(tetris.entries.length > general.entries.length);
  assert.ok(tetris.knownVariantIds.includes("specimen-137429610296"));
  assert.equal(scannerDocumentaryKnowledge("gamecube", []).entries.length, 0);
  assert.ok(scannerDocumentaryKnowledge("snes", []).entries.some((entry) => entry.text.includes("combinaciones")));
});
test("usage records real values, cached input is not added and missing is not zero", () => {
  assert.deepEqual(scannerUsageFromResponse({ usage: { input_tokens: 100, output_tokens: 5, total_tokens: 105, input_tokens_details: { cached_tokens: 20 } } }), {
    responseId: null, model: null, inputTokens: 100, outputTokens: 5, totalTokens: 105, cachedInputTokens: 20,
  });
  assert.equal(scannerUsageFromResponse({}).totalTokens, null);
});

test("independent photo readings map back to the correct global photo and component", () => {
  const merged = mergeScannerPerceptions([perception, perception]);
  assert.deepEqual(merged.observations.map((o) => o.photo), [1, 1, 2, 2]);
  assert.deepEqual(merged.observations.map((o) => o.id), ["o1", "o2", "o3", "o4"]);
});
test("conflicting game identities in different photos remain unresolved", () => {
  const merged = mergeScannerPerceptions([perception, { ...perception, title: "Tetris 2" }]);
  assert.equal(merged.title, null);
  assert.equal(merged.platformSlug, "gameboy");
  assert.equal(merged.identityConflict, true);
  assert.equal(merged.identityConfidence, 0);
  assert.equal(scannerInterpretationSkipReason(merged, "gameboy"), "identity_conflict");
  assert.equal(normalizeScannerReasoning({ region: { value: "PAL España", observationIds: ["o1"] } }, merged, sources, "gameboy").region.value, null);
});

test("GT64 reviewed abbreviated/full title keeps observed N64 platform and longest observed title", () => {
  const merged = mergeScannerPerceptions([
    { ...perception, platformSlug: "n64", title: "GT64" },
    { ...perception, platformSlug: "n64", title: "GT 64 Championship Edition" },
    { ...perception, platformSlug: null, title: null, identityConfidence: 0 },
  ]);
  assert.equal(merged.title, "GT 64 Championship Edition");
  assert.equal(merged.platformSlug, "n64");
  assert.equal(merged.identityConflict, false);
  assert.equal(merged.titleAliasId, "gt64-n64-title-20260908");
  assert.equal(scannerInterpretationSkipReason(merged, "n64"), null);
  assert.deepEqual(merged.photoReadings?.map((p) => p.title), ["GT64", "GT 64 Championship Edition", null]);
});

test("an alias never fills an unobserved subtitle, region or component pairing", () => {
  const merged = mergeScannerPerceptions([{ ...perception, platformSlug: "n64", title: "GT64" }]);
  assert.equal(merged.title, "GT64");
  assert.equal(normalizeScannerReasoning({}, merged, [], "n64").region.value, null);
  assert.equal(normalizeScannerReasoning({ composition: { status: "compatible", observationIds: ["o1", "o2"], sourceIds: ["documented"] } }, merged, sources, "n64").composition.status, "unknown");
});

test("unknown reverse-side identity and ordinary spacing do not veto a clear front", () => {
  const merged = mergeScannerPerceptions([
    { ...perception, title: "GT64", platformSlug: "n64" },
    { ...perception, title: "GT 64", platformSlug: "n64" },
    { ...perception, title: null, platformSlug: "n64", identityConfidence: 0 },
    { ...perception, title: null, platformSlug: null, identityConfidence: 0 },
  ]);
  assert.equal(merged.platformSlug, "n64");
  assert.equal(merged.identityConflict, false);
  assert.equal(merged.identityConfidence, 0.95);
});

test("title aliases are platform scoped and never authorize a sequel or unreviewed edition suffix", () => {
  for (const [platformSlug, title] of [["gameboy", "GT 64 Championship Edition"], ["n64", "GT 64 2"], ["n64", "GT 64 Deluxe"], ["n64", "GT 64 Championship Racing"]]) {
    const merged = mergeScannerPerceptions([{ ...perception, platformSlug, title: "GT64" }, { ...perception, platformSlug, title }]);
    assert.equal(merged.identityConflict, true);
    assert.equal(scannerInterpretationSkipReason(merged, platformSlug), "identity_conflict");
  }
});

test("conflicting platforms remain blocked even with equal game names", () => {
  const merged = mergeScannerPerceptions([perception, { ...perception, platformSlug: "snes" }]);
  assert.equal(merged.platformSlug, null);
  assert.equal(merged.platformConflict, true);
  assert.equal(scannerInterpretationSkipReason(merged, "gameboy"), "platform_conflict");
});

test("multiple titles in a single photo cannot be silently accepted as one specimen", () => {
  const multi = normalizeScannerPerception({ ...perception, multipleGames: true, title: null }, 1);
  const merged = mergeScannerPerceptions([multi, perception]);
  assert.equal(merged.platformSlug, "gameboy");
  assert.equal(scannerInterpretationSkipReason(merged, "gameboy"), "identity_conflict");
  assert.equal(normalizeScannerPerception({ multipleGames: "true" }, 1).multipleGames, false);
});

test("critical conflict diagnostics survive the uncertainty cap and photo doubts retain scope", () => {
  const doubts = Array.from({ length: 12 }, (_, i) => `Duda local ${i}`);
  const merged = mergeScannerPerceptions([{ ...perception, uncertainties: doubts }, { ...perception, title: "Tetris 2", uncertainties: ["Solo se ve la trasera."] }]);
  assert.equal(merged.uncertainties.length, 12);
  assert.equal(merged.uncertainties[0], SCANNER_SKIP_LABELS.identity_conflict);
  assert.ok(merged.uncertainties[1].startsWith("Foto 1:"));
  assert.deepEqual(merged.photoReadings?.[1].uncertainties, ["Solo se ve la trasera."]);
});

test("catalog candidates use only reviewed title equivalences and retain separate regional IDs", () => {
  const rows = [
    { id: "eu", title: "GT 64", platformSlug: "n64" },
    { id: "us", title: "GT 64: Championship Edition", platformSlug: "n64" },
    { id: "sequel", title: "GT 64 2", platformSlug: "n64" },
    { id: "other", title: "GT 64", platformSlug: "gameboy" },
    { id: "excluded", title: "GT 64", platformSlug: "n64", listingStatus: "excluded" },
  ];
  const snapshot = JSON.stringify(rows);
  const merged = mergeScannerPerceptions([{ ...perception, title: "GT64", platformSlug: "n64" }]);
  assert.deepEqual(exactScannerCatalogIds(rows, merged, "n64"), ["eu", "us"]);
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(exactScannerCatalogIds(rows, { ...merged, identityConflict: true }, "n64"), []);
});
