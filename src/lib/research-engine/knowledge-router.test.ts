import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildResearchCatalogContext } from "./catalog-context";
import { loadResearchKnowledge } from "./knowledge-loader";
import { parsePlatformKnowledge, parseResearchSources } from "./knowledge-schema";
import { loadLegacyScannerKnowledge } from "./legacy-knowledge-adapter";
import { routeResearch } from "./router";
import type { ResearchSubject } from "./types";
import type { ResearchCatalogContext, ResearchKnowledgeBundle, ResearchRouterInput, ResearchTargetField } from "./v2-types";

function subject(platformSlug = "n64"): ResearchSubject {
  return {
    id: `pilot:test-${platformSlug}`,
    kind: "related-release",
    catalogId: null,
    guideId: null,
    physicalEditionId: null,
    title: "Test Adventure",
    platformSlug,
    edition: "Standard",
    region: "Europe",
    barcode: null,
    productCodes: [],
    serials: [],
    marketRegions: [],
    evidenceMarkets: [],
    packagingLanguages: [],
    softwareLanguages: [],
    releaseStatus: null,
    physicalProductType: null,
    containsDisc: null,
    countsAsNativePhysicalRelease: null,
    confidence: null,
    evidenceCount: 0,
    sourceCount: 0,
    notes: [],
  };
}

function routerInput(knowledge: ResearchKnowledgeBundle, context: ResearchCatalogContext, targetField: ResearchTargetField): ResearchRouterInput {
  return {
    catalogContext: context,
    targetField,
    knownIdentifiers: [],
    platformKnowledge: knowledge.platform,
    companyKnowledge: [],
    franchiseKnowledge: [],
    sourceKnowledge: knowledge.sources,
    playbooks: knowledge.playbooks,
    queryTemplates: knowledge.queryTemplates,
    legacyKnowledge: knowledge.legacyEntries,
    currentClaims: [],
    currentConflicts: [],
  };
}

test("N64 knowledge is imported byte-for-byte and passes the versioned schema", async () => {
  const bytes = await readFile("data/research-engine/knowledge/platforms/n64.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "b9042ac3a7bd788b9f4851b727232c1161526c7ab41ce2ac2d4f539f8e00030c");
  const parsed = parsePlatformKnowledge(JSON.parse(bytes.toString("utf8")));
  assert.equal(parsed.knowledgeId, "regionatlas-n64-physical-research-v1");
  assert.equal(parsed.platformSlug, "n64");
  assert.ok(parsed.decisionTests.some((entry) => entry.id === "test-eur-cart"));
  assert.throws(() => parsePlatformKnowledge({ schemaVersion: 2 }), /schemaVersion=1/);
});

test("general knowledge schema loads all required documents", async () => {
  const bundle = await loadResearchKnowledge({ platformSlug: "n64" });
  assert.deepEqual(Object.keys(bundle.generalDocuments).sort(), [
    "barcode-rules",
    "identifier-patterns",
    "known-traps",
    "physical-product-rules",
    "region-patterns",
    "source-access",
    "source-capabilities",
  ]);
  assert.ok(bundle.loadedFiles.includes("data/research-engine/knowledge/platforms/n64.json"));
  assert.ok(!bundle.loadedFiles.some((filename) => filename.includes("/golden/")));
  assert.ok(bundle.sources.some((source) => source.id === "regionatlas-own-scan"));
});

test("legacy scanner adapter preserves reviewed versus candidate trust and source provenance", async () => {
  const entries = await loadLegacyScannerKnowledge({ platformSlug: "ds" });
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => ["reviewed_guidance", "candidate_only"].includes(entry.trust)));
  assert.ok(entries.every((entry) => entry.sources.length > 0 && entry.sources.every((source) => source.url.startsWith("https://"))));
  assert.ok(entries.every((entry) => entry.sourceIds.every((sourceId) => sourceId.startsWith(`${entry.batch}:`))));
});

test("router uses known catalog barcode and deduplicates rendered queries", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "n64" });
  const context = { ...buildResearchCatalogContext(subject()), barcode: "045496870010", ean: "045496870010" };
  const plan = routeResearch(routerInput(knowledge, context, "MARKET_REGION"));
  assert.ok(plan.factsUsed.includes("BARCODE=045496870010"));
  assert.ok(plan.queryPlan.some((query) => query.query.includes("045496870010")));
  assert.equal(plan.queryPlan.length, new Set(plan.queryPlan.map((query) => query.query.toLowerCase().replace(/\s+/g, " "))).size);
  assert.ok(plan.deterministicChecks.includes("SUBJECT_BINDING"));
});

test("router keeps broad queries broad and removes pending-edition placeholders", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "ds" });
  const context = {
    ...buildResearchCatalogContext(subject("ds")),
    title: "Assassin's Creed II: Discovery",
    edition: "Standard · España · identificadores pendientes",
    marketRegions: ["ES"],
  };
  const plan = routeResearch(routerInput(knowledge, context, "BARCODE"));
  assert.ok(plan.queryPlan.some((query) => query.sourceId === null && query.query.includes("España")));
  assert.ok(plan.queryPlan.every((query) => !/identificadores pendientes/i.test(query.query)));
});

test("router keeps component-code research available after a barcode is discovered", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "ds" });
  const context = {
    ...buildResearchCatalogContext(subject("ds")),
    title: "Assassin's Creed II: Discovery",
    edition: "Spain physical release",
    marketRegions: ["ES"],
  };
  const withBarcode = routerInput(knowledge, context, "BOX_CODE");
  withBarcode.knownIdentifiers = [{ type: "BARCODE", value: "3307211667372" }];
  const boxPlan = routeResearch(withBarcode);
  assert.equal(boxPlan.selectedPlaybook.id, "MISSING_BOX_CODE");
  assert.ok(boxPlan.queryPlan.some((query) => query.query.includes("3307211667372")));
  assert.equal(boxPlan.queryPlan[0]?.strategy, "EXACT_IDENTIFIER");
  assert.equal(boxPlan.queryPlan[0]?.identifierValue, "3307211667372");

  const productPlan = routeResearch(routerInput(knowledge, context, "PRODUCT_CODE"));
  assert.equal(productPlan.selectedPlaybook.id, "MISSING_PRODUCT_CODE");
  assert.ok(productPlan.imagePlan.some((row) => row.component === "CART_FRONT"));
});

test("router chases every candidate identifier before generic discovery", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "xbox360" });
  const context = {
    ...buildResearchCatalogContext(subject("xbox360")),
    title: "Assassin's Creed Brotherhood + Revelations Double Pack",
    edition: "Double Pack",
  };
  const input = routerInput(knowledge, context, "OUTER_INNER_RELATION");
  input.knownIdentifiers = ["1111111111116", "2222222222222", "3333333333338", "4444444444444"]
    .map((value) => ({ type: "BARCODE", value }));
  const plan = routeResearch(input);
  assert.equal(plan.selectedPlaybook.id, "DOUBLE_PACK_COMPONENTS");
  assert.deepEqual(plan.queryPlan.slice(0, 4).map((row) => row.identifierValue), input.knownIdentifiers.map((row) => row.value));
  assert.ok(plan.queryPlan.slice(0, 8).every((row) => row.strategy === "EXACT_IDENTIFIER"));
  assert.equal(plan.sourcePlan[0]?.sourceId, "dbox");
});

test("collector routing removes pending placeholders and searches the exact edition first", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "wiiu" });
  const context = {
    ...buildResearchCatalogContext(subject("wiiu")),
    title: "Assassin's Creed IV: Black Flag",
    edition: "Skull Edition · España · barcode pendiente",
  };
  const plan = routeResearch(routerInput(knowledge, context, "BARCODE"));
  assert.equal(plan.selectedPlaybook.id, "COLLECTOR_EDITION_FIRST");
  assert.match(plan.queryPlan[0]?.query ?? "", /Skull Edition/);
  assert.ok(plan.queryPlan.every((row) => !/barcode pendiente/i.test(row.query)));
});

test("target capabilities keep guarded prose away from Nintendo product-code proof", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "ds" });
  const plan = routeResearch(routerInput(knowledge, buildResearchCatalogContext(subject("ds")), "PRODUCT_CODE"));
  assert.equal(plan.sourcePlan.find((source) => source.sourceId === "gamefaqs-guarded")?.capabilityScore, 0);
  assert.equal(plan.sourcePlan.find((source) => source.sourceId === "dbox")?.capabilityScore, 88);
});

test("runtime knowledge does not contain pilot answer values", async () => {
  const files = [
    "data/research-engine/knowledge/franchises/assassins-creed.json",
    "data/research-engine/knowledge/sources.json",
    "data/research-engine/knowledge/source-capabilities.json",
    "data/research-engine/knowledge/query-templates.json",
    "data/research-engine/knowledge/playbooks/general.json",
  ];
  const text = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const forbidden of ["3307211667426", "3307215706091", "3307215689271", "3307215689165", "3307215693865", "3307215673393"]) {
    assert.equal(text.includes(forbidden), false, `${forbidden} leaked into runtime knowledge`);
  }
});

test("router selects serial and own-scan paths deterministically", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "ds" });
  const serialContext = { ...buildResearchCatalogContext(subject("ds")), serial: "NTR-ABCD-EUR" };
  const serialPlan = routeResearch(routerInput(knowledge, serialContext, "BARCODE"));
  assert.equal(serialPlan.selectedPlaybook.id, "SERIAL_KNOWN_BARCODE_UNKNOWN");
  assert.ok(serialPlan.queryPlan.some((query) => query.query.includes("NTR-ABCD-EUR")));

  const ownScanContext: ResearchCatalogContext = {
    ...serialContext,
    ownedScans: [{
      catalogId: "ds-test",
      capturedAt: "2026-09-16T00:00:00Z",
      sourceLabel: "Owner scan",
      barcode: null,
      boxCode: null,
      packagingLanguages: [],
      images: [{ role: "back", label: "Back", url: "https://images.example.test/back.jpg", thumbnailUrl: "https://images.example.test/back-thumb.jpg" }],
    }],
  };
  const ownScanPlan = routeResearch(routerInput(knowledge, ownScanContext, "BARCODE"));
  assert.equal(ownScanPlan.selectedPlaybook.id, "OWN_SCAN_FIRST");
  assert.equal(ownScanPlan.sourcePlan[0]?.sourceId, "regionatlas-own-scan");
});

test("source capability score is field-specific and legacy documentary sources remain labelled", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "ds" });
  const plan = routeResearch(routerInput(knowledge, buildResearchCatalogContext(subject("ds")), "BARCODE"));
  const retailer = plan.sourcePlan.find((source) => source.sourceId === "national-retailer");
  const ebay = plan.sourcePlan.find((source) => source.sourceId === "ebay");
  assert.equal(retailer?.capabilityScore, 90);
  assert.equal(ebay?.capabilityScore, 68);
  assert.ok((retailer?.capabilityScore ?? 0) > (ebay?.capabilityScore ?? 0));
  assert.ok(plan.sourcePlan.some((source) => source.sourceId.startsWith("legacy:") && source.roles.includes("LEGACY_SCANNER_DOCUMENTARY")));

  assert.throws(() => parseResearchSources({ schemaVersion: 1, sources: [{ id: "bad", hosts: [], platforms: [], countries: [], roles: [], accessModes: [], fieldCapabilities: {}, defaultReliability: 1, knownRisks: [], queryTemplates: [] }] }), /no valid accessModes/);
});
