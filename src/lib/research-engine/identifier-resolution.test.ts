import assert from "node:assert/strict";
import test from "node:test";
import {
  assessIdentifierSearchResults,
  createWorldwideCoverageLedger,
  deduplicateScopedQueries,
  discoverIdentifierCandidates,
  libretroAbsenceConclusion,
  libretroRegionalLead,
  nationalMarketRequirement,
  normalizeIdentifierCandidate,
  searchResultMatchesResearchScope,
  shouldStopFieldSearch,
  worldwideAcceptanceAllowed,
} from "./identifier-resolution";
import { buildWorldwideResearchTasks } from "./task-planner";
import type { ResearchSearchResult } from "./v2-types";

function hit(host: string, title: string, snippet: string): ResearchSearchResult {
  return { title, snippet, url: `https://${host}/item`, host, rank: 1, publishedAt: null, provider: "fixture" };
}

test("valid EAN candidate passes checksum and independent exact search corroborates title/platform", () => {
  const candidate = normalizeIdentifierCandidate("4006381333931", "BARCODE", "ps5");
  assert.equal(candidate.validation, "VALID");
  const result = assessIdentifierSearchResults({
    identifier: candidate.normalizedValue,
    context: { title: "Test Adventure", aliases: [], platformSlug: "ps5", edition: "Standard", region: "USA", broadRegion: "NORTH_AMERICA", marketRegions: ["US"] },
    hits: [
      hit("retailer.example", "Test Adventure PS5 USA", "EAN 4006381333931 ESRB"),
      hit("database.example", "Test Adventure PlayStation 5", "Barcode 4006381333931"),
    ],
  });
  assert.equal(result.status, "CORROBORATED");
  assert.equal(result.matchingSources.length, 2);
});

test("two exact title/platform hits remain partial when the scoped region is never bound", () => {
  const result = assessIdentifierSearchResults({
    identifier: "4006381333931",
    context: { title: "Test Adventure", aliases: [], platformSlug: "ps5", edition: "Standard", region: "Japan", broadRegion: "ASIA", marketRegions: ["JP"] },
    coverageBucket: "JAPAN",
    hits: [
      hit("retailer.example", "Test Adventure PS5", "Barcode 4006381333931"),
      hit("database.example", "Test Adventure PlayStation 5", "Barcode 4006381333931"),
    ],
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.reason, "REGION_BINDING_MISSING");
});

test("worldwide discovery rejects a USA result inside the Hong Kong/Taiwan scope", () => {
  const scoped = searchResultMatchesResearchScope({
    hit: hit("retailer.example", "Test Adventure PS5 USA", "ESRB UPC 4006381333931"),
    context: { title: "Test Adventure", aliases: [], platformSlug: "ps5", edition: "Standard · Hong Kong / Taiwan", region: "ASIA", broadRegion: "ASIA", marketRegions: ["HK", "TW"] },
    coverageBucket: "ASIA_OTHER",
  });
  assert.equal(scoped, false);
});

test("numeric garbage is rejected by format or checksum", () => {
  assert.equal(normalizeIdentifierCandidate("4240", "BARCODE", "ps5").validation, "FORMAT_REJECTED");
  assert.equal(normalizeIdentifierCandidate("4240-1234567890", "BARCODE", "ps5").validation, "FORMAT_REJECTED");
});

test("NUS-NRDP mapped consistently to another title becomes a hard subject conflict", () => {
  const result = assessIdentifierSearchResults({
    identifier: "NUS-NRDP",
    context: { title: "Resident Evil 2", aliases: ["Biohazard 2"], platformSlug: "n64", edition: "Standard", region: "USA", broadRegion: "NORTH_AMERICA", marketRegions: ["US"] },
    hits: [
      hit("technical.example", "Ready 2 Rumble Boxing Nintendo 64", "Product code NUS-NRDP"),
      hit("collector.example", "Ready 2 Rumble Boxing N64", "NUS-NRDP cartridge"),
    ],
  });
  assert.equal(result.status, "HARD_CONFLICT");
  assert.equal(result.reason, "HARD_IDENTIFIER_SUBJECT_CONFLICT");
});

test("same identifier emitted by several planners is exact-searched once per scope", () => {
  const deduped = deduplicateScopedQueries({
    rows: [
      { query: '"4006381333931"', identifierValue: "4006381333931" },
      { query: '  "4006381333931"  ', identifierValue: "4006381333931" },
      { query: '"4006381333931"', identifierValue: "4006381333931" },
    ],
    canonicalWork: "work:test",
    platform: "ps5",
    regionBucket: "EUROPE",
    field: "BARCODE",
  });
  assert.equal(deduped.rows.length, 1);
  assert.equal(deduped.prevented, 2);
});

test("a confirmed field stops unless conflict or SKU ambiguity remains", () => {
  assert.equal(shouldStopFieldSearch({ status: "CONFIRMED", hasConflict: false, hasEditionAmbiguity: false, hasMultipleSkuCandidate: false }), true);
  assert.equal(shouldStopFieldSearch({ status: "CONFIRMED", hasConflict: true, hasEditionAmbiguity: false, hasMultipleSkuCandidate: false }), false);
});

test("paneuropean physical edition can make national subdivision not required", () => {
  assert.equal(nationalMarketRequirement({ broadRegion: "EUROPE", marketRegions: [], physicalExistenceConfirmed: true, identifierConfirmed: true }), "NOT_REQUIRED");
  assert.equal(nationalMarketRequirement({ broadRegion: "EUROPE", marketRegions: [], physicalExistenceConfirmed: false, identifierConfirmed: true }), "REQUIRED");
});

test("Libretro regional entry survives a reused or absent thumbnail", () => {
  const lead = libretroRegionalLead("Example Game (Japan)", "https://images.example/shared.png");
  assert.equal(lead.status, "DISCOVERY_LEAD");
  assert.equal(lead.regionalCandidate, "Example Game (Japan)");
  assert.equal(libretroRegionalLead("Example Game (Japan)", null).status, "DISCOVERY_LEAD");
});

test("Libretro absence never becomes negative existence evidence", () => {
  assert.equal(libretroAbsenceConclusion(), "UNKNOWN");
});

test("worldwide mode creates searches even when catalog debt is zero", () => {
  const tasks = buildWorldwideResearchTasks({ subjectId: "catalog:test", title: "Test Adventure", platformSlug: "ps5", now: new Date("2026-09-17T00:00:00Z") });
  assert.equal(tasks.length, 6);
  assert.ok(tasks.every((task) => task.researchMode === "WORLDWIDE_VARIANT_DISCOVERY"));
  assert.ok(tasks.every((task) => task.status === "PENDING"));
});

test("worldwide acceptance is forbidden while any applicable bucket is unchecked or unresolved", () => {
  const ledger = createWorldwideCoverageLedger();
  assert.equal(worldwideAcceptanceAllowed(ledger), false);
  for (const row of ledger) row.status = "NO_DISTINCT_VARIANT_FOUND";
  assert.equal(worldwideAcceptanceAllowed(ledger), true);
  ledger[2].status = "UNRESOLVED";
  assert.equal(worldwideAcceptanceAllowed(ledger), false);
});

test("PS5 discovery recognizes serial, regional product IDs and valid barcodes without title-specific seeds", () => {
  const candidates = discoverIdentifierCandidates("PPSA-12345 ELJM-12345 ELAS-12345A 4006381333931", "ps5");
  assert.deepEqual(candidates.filter((row) => row.validation === "VALID").map((row) => `${row.type}:${row.normalizedValue}`).sort(), [
    "BARCODE:4006381333931",
    "PRODUCT_CODE:ELAS-12345A",
    "PRODUCT_CODE:ELJM-12345",
    "SERIAL:PPSA-12345",
  ]);
});

test("compact PS5 regional product IDs normalize to their canonical hyphenated form", () => {
  const candidates = discoverIdentifierCandidates("ELJM30750 ELAS11092A", "ps5");
  assert.deepEqual(candidates.map((row) => row.normalizedValue).sort(), ["ELAS-11092A", "ELJM-30750"]);
});

test("Absolum acceptance replay confirms the Asian barcode, keeps one-source ELAS partial, and invents no Korea barcode", () => {
  const context = { title: "Absolum", aliases: [], platformSlug: "ps5", edition: "Standard · Hong Kong / Taiwan", region: "ASIA", broadRegion: "ASIA", marketRegions: ["HK", "TW"] };
  const barcode = assessIdentifierSearchResults({
    identifier: "8809560335148",
    context,
    coverageBucket: "ASIA_OTHER",
    hits: [
      hit("asia-retailer.example", "Absolum PS5 Asian Chinese edition", "Barcode 8809560335148 Hong Kong"),
      hit("technical.example", "Absolum PlayStation 5 Asia", "EAN 8809560335148 Taiwan physical release"),
    ],
  });
  const productId = assessIdentifierSearchResults({
    identifier: "ELAS-11092A",
    context,
    coverageBucket: "ASIA_OTHER",
    hits: [hit("asia-retailer.example", "Absolum PS5 Asian Chinese edition", "Product ID ELAS-11092A Hong Kong")],
  });
  const korea = assessIdentifierSearchResults({
    identifier: "NO-CANDIDATE",
    context: { ...context, edition: "Standard · Korea", marketRegions: ["KR"] },
    coverageBucket: "ASIA_OTHER",
    hits: [],
  });
  assert.equal(barcode.status, "CORROBORATED");
  assert.equal(productId.status, "PARTIAL");
  assert.equal(korea.status, "UNRESOLVED");
});
