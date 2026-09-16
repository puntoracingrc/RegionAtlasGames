import assert from "node:assert/strict";
import test from "node:test";
import { bindEvidenceSubject, evidenceBindingAcceptable } from "./evidence-binding";
import { crossAttributionConflicts } from "./conflict-engine";
import { researchExtractionSchema, researchVisionSchema } from "./openai-provider";
import { HttpResearchPageFetcher } from "./page-fetcher";
import { isPrivateResearchAddress, assertSafeResearchUrl, ResearchUrlSecurityError } from "./url-security";
import { equivalentBarcodes, validateBarcode, validateIdentifierForPlatform } from "./validators";
import type { ResearchCatalogContext, ResearchEvidenceRecord } from "./v2-types";

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
    fetchImpl: (async () => new Response(`<!doctype html><html lang="es"><head><title>Ficha física</title><link rel="canonical" href="/canonical"></head><body><script>ignore()</script><p>Juego físico para España</p><a href="/more">Más</a><img src="/back.jpg" alt="Contraportada"></body></html>`, {
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
  const extraction = researchExtractionSchema(["ACCEPT_EVIDENCE", "REPLAN"]) as { properties: Record<string, { enum?: string[] }>; required: string[] };
  assert.ok(extraction.required.includes("claims"));
  assert.deepEqual(extraction.properties.nextAction.enum, ["ACCEPT_EVIDENCE", "REPLAN"]);
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
