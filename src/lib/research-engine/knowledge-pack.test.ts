import assert from "node:assert/strict";
import test from "node:test";
import { curatorHash, type PhysicalEvidenceBundleV1 } from "../review-curator";
import { buildResearchKnowledgePack, attachResearchKnowledgePack, assertResearchKnowledgePack, researchKnowledgePackSearchBudget } from "./knowledge-pack";
import { loadResearchKnowledge } from "./knowledge-loader";
import { authoritativeResearchSourceRegistry } from "./source-policy";
import { loadPlatformRoutingMatrix, resolvedPlatformRouting } from "./platform-routing-matrix";
import { routeResearch } from "./router";
import type { ResearchSubject } from "./types";

function fixture(platformSlug = "ps4"): { bundle: PhysicalEvidenceBundleV1; subject: ResearchSubject } {
  const inputHash = curatorHash("knowledge-pack-input");
  const evidenceHash = curatorHash("knowledge-pack-evidence");
  const bundle: PhysicalEvidenceBundleV1 = {
    schemaVersion: 1, reviewItemId: "knowledge-case", queueVersion: "q", inputHash, evidenceHash, source: "fixture", capturedAt: null, reason: null, triageBucket: null,
    listing: { id: "listing", url: "https://example.test/listing", title: "Assassin's Creed Odyssey", description: null, searchQuery: null },
    catalog: { searchedCatalogId: "ps4-assassins-creed-odyssey", candidateCatalogId: "ps4-assassins-creed-odyssey", alternatives: [] },
    subject: { identity: "Assassin's Creed Odyssey", platform: platformSlug, edition: "standard", physicalVariant: null },
    images: [], originalImages: [], productGraph: { nodes: [], relations: [] }, observations: [], identifiers: [],
    regional: { targetRegion: "PAL España", detectedRegion: "PAL España", marketBinding: "UNBOUND", evidence: [], packagingLanguages: [], distributors: [], ratingSystems: [] },
    condition: { bucket: "unknown", confidence: null, evidence: [], manualExpected: null, originalContentsExpected: [] },
    price: { amount: null, shipping: null, currency: "EUR", estimatedTotalToSpain: null }, confidence: null, conflicts: [], confirmed: [], rejected: [], uncertain: ["market_region"],
    evidenceGaps: [{ field: "MARKET_REGION", code: "MISSING_MARKET_PROOF", missingProof: "Need market-bound evidence", recommendedSourceTypes: ["EXACT_PHYSICAL_PHOTO"] }],
  };
  const subject: ResearchSubject = {
    id: "knowledge-subject", kind: "catalog-entry", catalogId: "ps4-assassins-creed-odyssey", guideId: null, physicalEditionId: null,
    title: "Assassin's Creed Odyssey", platformSlug, edition: "standard", region: "PAL España", barcode: null, productCodes: [], serials: [],
    marketRegions: ["PAL España"], evidenceMarkets: [], packagingLanguages: [], softwareLanguages: [], releaseStatus: null,
    physicalProductType: "PHYSICAL_FULL_GAME", containsDisc: true, countsAsNativePhysicalRelease: true, confidence: null, evidenceCount: 0, sourceCount: 0, notes: [],
  };
  return { bundle, subject };
}

test("knowledge pack precomputes facts, sources, queries and forbidden inferences", async () => {
  const { bundle, subject } = fixture();
  const pack = await buildResearchKnowledgePack({ bundle, subject, generatedAt: "2026-09-16T00:00:00.000Z" });
  const plan = pack.fieldPlans.MARKET_REGION!;
  assert.equal(pack.schemaVersion, 1);
  assert.ok(plan.knownFacts.some((fact) => fact.includes("platform=ps4")));
  assert.ok(plan.preferredSourceIds.includes("regionatlas-own-scan"));
  assert.equal(plan.exactQueries.at(-1)?.strategy, "GENERIC_LAST_RESORT");
  assert.ok(plan.forbiddenInferences.some((rule) => rule.includes("sellerCountry")));
  const nonGeneric = plan.exactQueries.filter((row) => row.strategy !== "GENERIC_LAST_RESORT").length;
  assert.equal(researchKnowledgePackSearchBudget(pack, "MARKET_REGION"), nonGeneric + 1);
  assert.equal(researchKnowledgePackSearchBudget(pack, "MARKET_REGION", { reserveImageSearch: true }), nonGeneric + 2);
  const attached = attachResearchKnowledgePack(bundle, pack);
  assertResearchKnowledgePack(attached);
  assert.equal(attached.knowledgePack.packId, pack.packId);
});

test("router consumes the pack with exact URLs and bounded generic-last ordering", async () => {
  const { bundle, subject } = fixture();
  const pack = await buildResearchKnowledgePack({ bundle, subject, generatedAt: "2026-09-16T00:00:00.000Z" });
  const knowledge = await loadResearchKnowledge({ platformSlug: subject.platformSlug });
  const plan = routeResearch({
    catalogContext: pack.catalogContext,
    targetField: "MARKET_REGION",
    knownIdentifiers: pack.knownIdentifiers.map(({ type, value }) => ({ type, value })),
    platformKnowledge: knowledge.platform,
    companyKnowledge: [],
    franchiseKnowledge: knowledge.franchiseRules,
    sourceKnowledge: knowledge.sources,
    playbooks: knowledge.playbooks,
    queryTemplates: knowledge.queryTemplates,
    legacyKnowledge: knowledge.legacyEntries,
    currentClaims: [],
    currentConflicts: [],
    evidenceGaps: bundle.evidenceGaps.map((gap) => ({
      field: "MARKET_REGION" as const,
      type: "MISSING_MARKET_PROOF" as const,
      candidateValue: null,
      missingProof: gap.missingProof,
      recommendedActions: [gap.missingProof],
      recommendedSourceTypes: gap.recommendedSourceTypes,
      exhaustedActions: [],
    })),
    researchMode: "PHYSICAL_EVIDENCE_MODE",
    knowledgePack: pack,
  });

  assert.equal(plan.directUrlPlan[0]?.url, bundle.listing.url);
  assert.equal(plan.sourcePlan[0]?.sourceId, pack.fieldPlans.MARKET_REGION?.preferredSourceIds[0]);
  assert.ok(plan.factsUsed.includes(`knowledgePack=${pack.packId}`));
  const firstGeneric = plan.queryPlan.findIndex((row) => row.strategy === "GENERIC");
  const sourceSpecificEnd = firstGeneric === -1 ? plan.queryPlan.length : firstGeneric;
  assert.ok(sourceSpecificEnd > 0);
  assert.ok(plan.queryPlan.slice(0, sourceSpecificEnd).every((row) => row.strategy !== "GENERIC"));
  if (firstGeneric !== -1) assert.ok(plan.queryPlan.slice(firstGeneric).every((row) => row.strategy === "GENERIC"));
  assert.ok(plan.queryPlan.slice(0, sourceSpecificEnd).some((row) => row.strategy === "SOURCE_SPECIFIC"));
});

test("authoritative registry consolidates legacy technical sources with field limits", () => {
  const sources = authoritativeResearchSourceRegistry();
  for (const id of ["serialstation", "redump", "no-intro", "datomatic", "dbox"]) assert.ok(sources.some((source) => source.id === id), id);
  const redump = sources.find((source) => source.id === "redump")!;
  assert.ok((redump.fieldCapabilities.MEDIA_ID ?? 0) > 0);
  assert.ok((redump.fieldCapabilities.MARKET_REGION ?? 0) < 50);
  assert.equal(redump.fieldCapabilities.PACKAGING_LANGUAGES, 0);
});

test("platform matrix covers benchmark and family-routed catalog platforms without inventing completeness", () => {
  const matrix = loadPlatformRoutingMatrix();
  for (const platform of ["ps1", "ps2", "ps3", "ps4", "ps5", "psp", "psvita", "xbox", "xbox360", "xboxone", "xboxseries", "nes", "snes", "n64", "gamecube", "wii", "wiiu", "gameboy", "gbc", "gba", "ds", "3ds", "switch", "switch2", "mastersystem", "megadrive", "saturn", "dreamcast", "neogeo", "neogeocd"]) {
    const route = resolvedPlatformRouting(matrix, platform);
    assert.ok(route, platform);
    assert.ok(route.fields.PRODUCT_CODE?.length, `${platform}:PRODUCT_CODE`);
    assert.ok(route.fields.MARKET_REGION?.length, `${platform}:MARKET_REGION`);
  }
  assert.equal(matrix.platforms.mastersystem.status, "INCOMPLETE");
  assert.equal(matrix.platforms.saturn.status, "INCOMPLETE");
});
