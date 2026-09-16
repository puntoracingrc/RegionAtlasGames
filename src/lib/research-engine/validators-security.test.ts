import assert from "node:assert/strict";
import test from "node:test";
import { bindEvidenceSubject, evidenceBindingAcceptable } from "./evidence-binding";
import { crossAttributionConflicts } from "./conflict-engine";
import { researchExtractionSchema, researchVisionSchema } from "./openai-provider";
import { HttpResearchPageFetcher } from "./page-fetcher";
import { isPrivateResearchAddress, assertSafeResearchUrl, ResearchUrlSecurityError } from "./url-security";
import { validateClaimDeterministically, equivalentBarcodes, validateBarcode, validateIdentifierForPlatform } from "./validators";
import { claimsFromVision } from "./worker";
import type { DurableResearchTask, ResearchCatalogContext, ResearchEvidenceRecord, ResearchState, ResearchVisionResult } from "./v2-types";

const context = {
  title: "Exact Game",
  aliases: ["Exact Game Alias"],
  platformSlug: "xbox360",
  edition: "Skull Edition",
  physicalVariant: "Spain",
} as ResearchCatalogContext;

test("EAN-13 and UPC-A checksum validation preserves and normalizes digits", () => {
  assert.deepEqual(validateBarcode("4006 3813-33931"), {
    observed: "4006 3813-33931",
    digits: "4006381333931",
    format: "EAN13",
    valid: true,
    normalizedEan13: "4006381333931",
    error: null,
  });
  assert.equal(validateBarcode("4006381333932").error, "BARCODE_CHECKSUM");
  assert.equal(validateBarcode("036000291452").format, "UPCA");
  assert.equal(equivalentBarcodes("036000291452", "0036000291452"), true);
});

test("platform identifier guard rejects Xbox 360 plus BLES contamination", () => {
  assert.ok(validateIdentifierForPlatform("xbox360", "BLES-01234").includes("PLATFORM_IDENTIFIER_CONFLICT"));
  assert.deepEqual(validateIdentifierForPlatform("ps3", "BLES-01234"), []);
});

test("URL security rejects credentials, localhost, private DNS and special addresses", async () => {
  assert.equal(isPrivateResearchAddress("127.0.0.1"), true);
  assert.equal(isPrivateResearchAddress("10.2.3.4"), true);
  assert.equal(isPrivateResearchAddress("8.8.8.8"), false);
  await assert.rejects(() => assertSafeResearchUrl("file:///etc/passwd"), (error: unknown) => error instanceof ResearchUrlSecurityError && error.code === "UNSUPPORTED_PROTOCOL");
  await assert.rejects(() => assertSafeResearchUrl("https://user:pass@example.com"), (error: unknown) => error instanceof ResearchUrlSecurityError && error.code === "URL_CREDENTIALS");
  await assert.rejects(() => assertSafeResearchUrl("http://localhost/private"), (error: unknown) => error instanceof ResearchUrlSecurityError && error.code === "BLOCKED_HOST");
  await assert.rejects(
    () => assertSafeResearchUrl("https://safe-looking.example/page", async () => [{ address: "192.168.1.8", family: 4 }]),
    (error: unknown) => error instanceof ResearchUrlSecurityError && error.code === "PRIVATE_ADDRESS",
  );
});

test("page fetcher parses bounded HTML and blocks redirect-to-private SSRF", async () => {
  const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
  const fetcher = new HttpResearchPageFetcher({
    resolver,
    fetchImpl: (async () => new Response(`<!doctype html><html lang="es"><head><title>Ficha física</title><link rel="canonical" href="/canonical"><meta property="og:image" content="/social.jpg"><script type="application/ld+json">{"@type":"Product","image":["/product-front.jpg"]}</script></head><body><script>ignore()</script><p>Juego físico para España</p><a href="/more">Más</a><img src="/back.jpg" srcset="/back-large.jpg 2x" alt="Contraportada"></body></html>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as typeof fetch,
  });
  const page = await fetcher.fetch("https://example.com/item");
  assert.equal(page.title, "Ficha física");
  assert.equal(page.canonicalUrl, "https://example.com/canonical");
  assert.ok(page.text.includes("Juego físico"));
  assert.ok(!page.text.includes("ignore()"));
  assert.deepEqual(page.links, ["https://example.com/more"]);
  assert.equal(page.imageCandidates[0]?.url, "https://example.com/back.jpg");
  assert.ok(page.imageCandidates.some((image) => image.url === "https://example.com/back-large.jpg"));
  assert.ok(page.imageCandidates.some((image) => image.url === "https://example.com/social.jpg"));
  assert.ok(page.imageCandidates.some((image) => image.url === "https://example.com/product-front.jpg"));

  const redirecting = new HttpResearchPageFetcher({
    resolver,
    fetchImpl: (async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })) as typeof fetch,
  });
  await assert.rejects(() => redirecting.fetch("https://example.com/start"), /Private and special-use addresses are blocked/);
});

test("structured-output schemas force component classification and field-scoped extraction", () => {
  const vision = researchVisionSchema() as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
  assert.equal(vision.additionalProperties, false);
  assert.ok(vision.required.includes("component"));
  assert.ok(vision.required.includes("barcodeCandidates"));
  assert.ok(vision.required.includes("packagingLanguagesObserved"));
  assert.ok(vision.required.includes("physicalContentAssessment"));
  assert.ok(vision.required.includes("barcodeBinding"));
  assert.ok(vision.required.includes("barcodeProductRole"));
  const extraction = researchExtractionSchema(["ACCEPT_EVIDENCE", "REPLAN"]) as { properties: Record<string, { enum?: string[] }>; required: string[] };
  assert.ok(extraction.required.includes("claims"));
  assert.deepEqual(extraction.properties.nextAction.enum, ["ACCEPT_EVIDENCE", "REPLAN"]);
});

test("Nintendo component validation separates box, cart and invalid prose digits", () => {
  const ds = { ...context, platformSlug: "ds" } as ResearchCatalogContext;
  assert.ok(validateClaimDeterministically({ field: "BOX_CODE", value: "TWL-TEST-EUR", component: "CART_FRONT" }, ds).includes("BOX_CODE_WRONG_COMPONENT"));
  assert.ok(validateClaimDeterministically({ field: "PRODUCT_CODE", value: "22222222", component: "CART_FRONT" }, ds).includes("PRODUCT_CODE_PATTERN_REQUIRED"));
  assert.ok(validateClaimDeterministically({ field: "PRODUCT_CODE", value: "TWL-TEST-EUR", component: "BOX_BACK" }, ds).includes("PRODUCT_CODE_WRONG_COMPONENT"));
  assert.deepEqual(validateClaimDeterministically({ field: "PRODUCT_CODE", value: "TWL-TEST-EUR", component: "CART_FRONT" }, ds), []);
});

test("physical product type is closed to the canonical taxonomy", () => {
  assert.ok(validateClaimDeterministically({ field: "PHYSICAL_PRODUCT_TYPE", value: "software", component: "BACK" }, context).includes("PHYSICAL_PRODUCT_TYPE_TAXONOMY"));
  assert.deepEqual(validateClaimDeterministically({ field: "PHYSICAL_PRODUCT_TYPE", value: "PHYSICAL_DOWNLOAD_REQUIRED", component: "BACK" }, context), []);
});

test("vision claims preserve Switch download classification and Xbox outer binding", () => {
  const baseVision: ResearchVisionResult = {
    component: "OUTER_BOX",
    titleCandidate: "Exact Game",
    platformCandidate: "Xbox 360",
    editionCandidate: "Skull Edition",
    barcodeCandidates: ["4006381333931"],
    printedCodes: [],
    packagingLanguagesObserved: [],
    ratingMarks: [],
    publisherText: [],
    distributorText: [],
    downloadStatements: ["additional download required"],
    physicalContentAssessment: "PARTIAL_DOWNLOAD",
    barcodeBinding: "OUTER_COLLECTOR_PACKAGE",
    barcodeProductRole: "OUTER_PRODUCT",
    stickerDetected: false,
    imageQuality: "GOOD",
    confidenceByField: { PHYSICAL_PRODUCT_TYPE: 0.9, OUTER_INNER_RELATION: 0.9 },
  };
  const task = { id: "task", targetField: "PHYSICAL_PRODUCT_TYPE" } as DurableResearchTask;
  const state = { runId: "run" } as ResearchState;
  const evidence = { id: "ev", sourceId: "photo", sourceUrl: "https://example.com/photo" } as ResearchEvidenceRecord;
  const physical = claimsFromVision({ state, task, context, evidence, result: baseVision });
  assert.equal(physical[0]?.value, "PHYSICAL_DOWNLOAD_REQUIRED");

  const outer = claimsFromVision({ state, task: { ...task, targetField: "OUTER_INNER_RELATION" }, context, evidence, result: baseVision });
  assert.deepEqual(outer[0]?.value, {
    identifier: "4006381333931",
    productRole: "OUTER_PRODUCT",
    barcodeBinding: "OUTER_COLLECTOR_PACKAGE",
    observedTitle: "Exact Game",
  });
  assert.deepEqual(outer[0]?.validationErrors, []);
});

test("evidence binding rejects wrong edition and emits a critical cross-attribution conflict", () => {
  const binding = bindEvidenceSubject({
    context,
    observedTitle: "Exact Game",
    observedPlatform: "xbox360",
    observedEdition: "Standard Edition",
    observedVariant: "Spain",
  });
  assert.equal(binding.game, "MATCH");
  assert.equal(binding.platform, "MATCH");
  assert.equal(binding.edition, "MISMATCH");
  assert.equal(evidenceBindingAcceptable(binding), false);
  const evidence: ResearchEvidenceRecord = {
    id: "ev-1",
    runId: "run-1",
    taskId: "task-1",
    sourceId: "retailer",
    sourceUrl: "https://example.com/item",
    canonicalUrl: "https://example.com/item",
    sourceType: "RETAILER",
    host: "example.com",
    fetchedAt: "2026-09-16T00:00:00Z",
    evidenceType: "PAGE_TEXT",
    subjectBinding: binding,
    relevantExcerpt: "Standard Edition",
    imageUrl: null,
    imageHash: null,
    textHash: "abc",
    capabilities: ["BARCODE"],
    reliability: 90,
    component: null,
  };
  const conflicts = crossAttributionConflicts([evidence]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].severity, "CRITICAL");
});
