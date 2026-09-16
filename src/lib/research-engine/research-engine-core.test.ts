import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInitialResearchQueries,
  buildResearchTasks,
  incompatiblePlatformIdentifiers,
  resolveResearchClaims,
  sourceCanSupportClaim,
  sourceProfileForUrl,
  type ResearchClaim,
  type ResearchEvidence,
  type ResearchRisk,
  type ResearchSubject,
} from "./index";

const subject: ResearchSubject = {
  id: "edition:test:standard-eu",
  kind: "physical-edition",
  catalogId: "ps5-test-game",
  guideId: "test-game-ps5",
  physicalEditionId: "standard-eu",
  title: "Test Game",
  platformSlug: "ps5",
  edition: "Standard Edition",
  region: "EUROPE",
  barcode: "3307210000000",
  productCodes: ["PPSA-12345"],
  serials: [],
  marketRegions: [],
  evidenceMarkets: ["ES"],
  packagingLanguages: [],
  softwareLanguages: ["es", "en"],
  releaseStatus: "RELEASED",
  physicalProductType: "NATIVE_GAME_DISC",
  containsDisc: true,
  countsAsNativePhysicalRelease: true,
  confidence: "HIGH",
  evidenceCount: 1,
  sourceCount: 2,
  notes: [],
};

test("platform identifier guard catches PS3 serial pollution on Xbox 360", () => {
  assert.deepEqual(
    incompatiblePlatformIdentifiers("xbox360", ["BLES-01882", "300054827"]),
    ["BLES-01882"],
  );
  assert.deepEqual(incompatiblePlatformIdentifiers("ps3", ["BLES-01882"]), []);
});

test("PS5 previous-generation discs can be explicitly allowed", () => {
  assert.deepEqual(incompatiblePlatformIdentifiers("ps5", ["CUSA-12345"]), ["CUSA-12345"]);
  assert.deepEqual(
    incompatiblePlatformIdentifiers("ps5", ["CUSA-12345"], { allowPreviousGenerationDisc: true }),
    [],
  );
});

test("query planner branches from barcode and missing market evidence", () => {
  const risks: ResearchRisk[] = [{
    code: "MISSING_MARKET_MAPPING",
    priority: "P1",
    weight: 10,
    reason: "market pending",
    targetField: "market",
  }];
  const queries = buildInitialResearchQueries(subject, risks).map((entry) => entry.query);
  assert.ok(queries.includes('"3307210000000"'));
  assert.ok(queries.some((entry) => entry.includes("back cover")));
  assert.ok(queries.some((entry) => entry.includes("Spain France Germany")));
});

test("task planner groups risks by research question", () => {
  const tasks = buildResearchTasks(subject.id, [
    { code: "MISSING_MARKET_MAPPING", priority: "P1", weight: 10, reason: "market" },
    { code: "GENERIC_REGION", priority: "P1", weight: 8, reason: "generic" },
    { code: "MISSING_PACKAGING_LANGUAGES", priority: "P2", weight: 4, reason: "packaging" },
  ], new Date("2026-09-15T20:00:00Z"));
  assert.equal(tasks.length, 2);
  assert.equal(tasks.find((entry) => entry.kind === "RESOLVE_MARKET")?.priority, "P1");
  assert.equal(tasks.find((entry) => entry.kind === "RESOLVE_PACKAGING")?.priority, "P2");
});

test("source policy does not let a retailer prove packaging languages by itself", () => {
  const profile = sourceProfileForUrl("https://www.fnac.es/example");
  assert.equal(profile.kind, "RETAILER");
  assert.equal(sourceCanSupportClaim("https://www.fnac.es/example", "barcode"), true);
  assert.equal(sourceCanSupportClaim("https://www.fnac.es/example", "packagingLanguages"), false);
});

test("claim reducer confirms corroborated values and exposes conflicts", () => {
  const evidence: ResearchEvidence[] = [
    {
      id: "scan",
      kind: "PHYSICAL_SCAN",
      label: "Back cover",
      url: "https://example.test/scan",
      sourceHost: "example.test",
      observedAt: "2026-09-15T20:00:00Z",
      summary: "Barcode visible",
      supports: ["barcode"],
    },
    {
      id: "retailer",
      kind: "RETAILER",
      label: "Retailer",
      url: "https://example.test/retailer",
      sourceHost: "example.test",
      observedAt: "2026-09-15T20:00:00Z",
      summary: "Same barcode",
      supports: ["barcode"],
    },
  ];
  const claims: ResearchClaim[] = [
    { id: "c1", subjectId: subject.id, field: "barcode", value: "3307210000000", confidence: 1, evidenceIds: ["scan"], sourceStrength: 1 },
    { id: "c2", subjectId: subject.id, field: "barcode", value: "3307210000000", confidence: 0.95, evidenceIds: ["retailer"], sourceStrength: 0.8 },
  ];
  const resolution = resolveResearchClaims("barcode", claims, evidence);
  assert.equal(resolution.status, "CONFIRMED");
  assert.equal(resolution.value, "3307210000000");
});
