import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchCatalogContext } from "./catalog-context";
import { loadResearchKnowledge } from "./knowledge-loader";
import { HttpResearchPageFetcher } from "./page-fetcher";
import {
  canonicalResearchComponent,
  createEvidenceGap,
  createProductNode,
  genericQueriesAllowedAfterPhysicalMode,
  identifierBinding,
  imageContentHash,
  mergeProductGraph,
  marketBindingState,
  physicalBindingState,
  subjectAccepted,
  enforceExpectedEditionSubjectClass,
} from "./physical-evidence";
import { routeResearch } from "./router";
import type { ResearchSubject } from "./types";
import type { ResearchRouterInput } from "./v2-types";

const subject: ResearchSubject = {
  id: "pilot:physical-evidence-test", kind: "related-release", catalogId: null, guideId: null, physicalEditionId: null,
  title: "Example Compilation", platformSlug: "xbox360", edition: "Double Pack", region: "Europe", barcode: null,
  productCodes: [], serials: [], marketRegions: [], evidenceMarkets: [], packagingLanguages: [], softwareLanguages: [],
  releaseStatus: null, physicalProductType: null, containsDisc: null, countsAsNativePhysicalRelease: null, confidence: null,
  evidenceCount: 0, sourceCount: 0, notes: [],
};

test("physical product graph preserves outer, inner and media nodes without cross-attribution", () => {
  const root = createProductNode({ label: "Compilation", type: "PHYSICAL_PRODUCT" });
  const outer = createProductNode({ label: "Outer package", type: "OUTER_PACKAGE", component: "OUTER_PACKAGE_BACK", parentProductId: root.id });
  const inner = createProductNode({ label: "Inner game", type: "INNER_PRODUCT", component: "INNER_CASE_BACK", parentProductId: root.id });
  const media = createProductNode({ label: "Disc", type: "MEDIA", component: "DISC", parentProductId: inner.id });
  const graph = mergeProductGraph({
    nodes: [root], relations: [], nextNodes: [outer, inner, media],
    nextRelations: [
      { fromNodeId: outer.id, toNodeId: root.id, relation: "WRAPS", evidenceIds: ["ev-outer"] },
      { fromNodeId: inner.id, toNodeId: root.id, relation: "BUNDLES", evidenceIds: ["ev-inner"] },
      { fromNodeId: media.id, toNodeId: inner.id, relation: "MEDIA_FOR", evidenceIds: ["ev-media"] },
    ],
  });
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.relations.length, 3);
  assert.notEqual(outer.id, inner.id);
});

test("subject gate and component gate fail closed before identifier binding", () => {
  assert.equal(subjectAccepted("EXACT_PRODUCT"), true);
  assert.equal(subjectAccepted("SAME_TITLE_DIFFERENT_PLATFORM"), false);
  assert.equal(physicalBindingState({ subjectClass: "SAME_TITLE_DIFFERENT_EDITION", component: "OUTER_PACKAGE_BACK", productNodeId: "p" }), "REJECTED");
  assert.equal(physicalBindingState({ subjectClass: "EXACT_PRODUCT", component: "UNKNOWN_COMPONENT", productNodeId: "p" }), "UNBOUND");
  const rejected = identifierBinding({ identifierType: "BARCODE", value: "4006381333931", component: "OUTER_PACKAGE_BACK", productNodeId: "p", componentNodeId: "c", evidenceId: "ev", subjectClass: "SAME_TITLE_DIFFERENT_EDITION" });
  assert.equal(rejected.state, "REJECTED");
});

test("collector subject binding requires explicit visible expected-edition proof", () => {
  assert.equal(enforceExpectedEditionSubjectClass({ subjectClass: "EXACT_PRODUCT", expectedEdition: "Skull Edition · Spain", editionClass: "STANDARD", visibleEditionMarker: null }), "SAME_TITLE_DIFFERENT_EDITION");
  assert.equal(enforceExpectedEditionSubjectClass({ subjectClass: "EXACT_PRODUCT", expectedEdition: "Skull Edition · Spain", editionClass: "EXPECTED_EDITION", visibleEditionMarker: "Skull Edition" }), "EXACT_PRODUCT");
  assert.equal(enforceExpectedEditionSubjectClass({ subjectClass: "EXACT_PRODUCT", expectedEdition: "Spain physical release", editionClass: "UNKNOWN", visibleEditionMarker: null }), "EXACT_PRODUCT");
});

test("generic distributor and packaging language never prove a national market", () => {
  assert.equal(marketBindingState({ distributorText: ["Ubisoft"], packagingLanguagesObserved: ["Spanish"] }), "LANGUAGE_ONLY");
  assert.equal(marketBindingState({ distributorText: ["Ubisoft"], packagingLanguagesObserved: [] }), "UNBOUND");
  assert.equal(marketBindingState({ distributorText: [], packagingLanguagesObserved: [], explicitMarket: "Spain" }), "MARKET_BOUND");
});

test("legacy Nintendo cart and box components canonicalize to different physical nodes", () => {
  assert.equal(canonicalResearchComponent("CART_FRONT"), "CARTRIDGE_FRONT");
  assert.equal(canonicalResearchComponent("BOX_BACK"), "OUTER_PACKAGE_BACK");
  assert.notEqual(canonicalResearchComponent("CART_FRONT"), canonicalResearchComponent("BOX_BACK"));
});

test("gallery acquisition keeps thumbnail, linked original, provenance and listing id", async () => {
  const fetcher = new HttpResearchPageFetcher({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: (async () => new Response('<html><body><a href="/original-back.jpg"><img src="/thumb.jpg" data-image-url="/data-original.jpg" alt="Box Back Europe"></a><script type="application/ld+json">{"@type":"Product","url":"https://example.com/product","image":{"@type":"ImageObject","contentUrl":"https://example.com/jsonld-cover.jpg"}}</script><script>const broken="https://example.com/${item.image}.jpg"</script></body></html>', { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch,
  });
  const page = await fetcher.fetch("https://example.com/item~x549000622");
  const image = page.imageCandidates.find((row) => row.originalUrl?.endsWith("/data-original.jpg"));
  assert.equal(image?.thumbnailUrl, "https://example.com/thumb.jpg");
  assert.equal(image?.resolvedUrl, "https://example.com/data-original.jpg");
  assert.equal(image?.listingId, "549000622");
  assert.equal(image?.galleryLabel, "Box Back Europe");
  assert.ok(page.imageCandidates.every((row) => !/%7B|\$\{/i.test(row.url)));
  assert.ok(page.imageCandidates.some((row) => row.resolvedUrl === "https://example.com/jsonld-cover.jpg"));
  assert.ok(page.imageCandidates.every((row) => row.resolvedUrl !== "https://example.com/product"));
});

test("content hashes deduplicate equal bytes independently of image URL", () => {
  const bytes = new TextEncoder().encode("same physical image bytes");
  assert.equal(imageContentHash(bytes), imageContentHash(bytes));
  assert.notEqual(imageContentHash(bytes), imageContentHash(new TextEncoder().encode("different")));
});

test("evidence gaps deterministically enter physical routes and cap generic queries", async () => {
  const gap = createEvidenceGap({ field: "OUTER_INNER_RELATION", candidateValue: null, missingProof: "Need the outer package", recommendedSourceTypes: ["todocoleccion"] });
  assert.equal(gap.type, "MISSING_OUTER_BOX_PHOTO");
  assert.ok(gap.recommendedActions.includes("OPEN_EXISTING_GALLERIES"));
  assert.equal(genericQueriesAllowedAfterPhysicalMode(["SOURCE_SPECIFIC", "GENERIC"], 2), true);
  assert.equal(genericQueriesAllowedAfterPhysicalMode(["GENERIC", "GENERIC"], 2), false);

  const knowledge = await loadResearchKnowledge({ platformSlug: "xbox360" });
  const input: ResearchRouterInput = {
    catalogContext: buildResearchCatalogContext(subject), targetField: "OUTER_INNER_RELATION", knownIdentifiers: [],
    platformKnowledge: knowledge.platform, companyKnowledge: [], franchiseKnowledge: [], sourceKnowledge: knowledge.sources,
    playbooks: knowledge.playbooks, queryTemplates: knowledge.queryTemplates, legacyKnowledge: knowledge.legacyEntries,
    currentClaims: [], currentConflicts: [], evidenceGaps: [gap], researchMode: "PHYSICAL_EVIDENCE_MODE",
  };
  const plan = routeResearch(input);
  assert.equal(plan.researchMode, "PHYSICAL_EVIDENCE_MODE");
  assert.ok(plan.queryPlan.some((row) => row.strategy === "SOURCE_SPECIFIC" && /outer box/.test(row.query)));
  assert.ok(plan.queryPlan.filter((row) => row.strategy === "GENERIC").length <= 2);
});

test("observed source capabilities are target-specific and acquisition-specific", async () => {
  const knowledge = await loadResearchKnowledge({ platformSlug: "ds" });
  const launchbox = knowledge.sources.find((row) => row.id === "launchbox-images");
  const retailer = knowledge.sources.find((row) => row.id === "national-retailer");
  assert.equal(launchbox?.physicalImageCapabilities?.componentLabels, true);
  assert.equal(launchbox?.physicalImageCapabilities?.originalImages, true);
  assert.equal(launchbox?.physicalImageCapabilities?.backImages, true);
  assert.equal(launchbox?.physicalImageCapabilities?.cartImages, true);
  assert.equal(retailer?.physicalImageCapabilities?.gallery, false);
  assert.equal(retailer?.physicalImageCapabilities?.realSpecimenImages, false);
  assert.ok((retailer?.fieldCapabilities.PACKAGING_LANGUAGES ?? 0) < (retailer?.fieldCapabilities.BARCODE ?? 0));
});
