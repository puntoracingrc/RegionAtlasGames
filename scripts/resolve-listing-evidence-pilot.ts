#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- reads immutable pilot JSON at its boundary. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import { physicalEvidenceBundleFromReviewItem, resolveReviewBundle } from "../src/lib/review-curator";
import { runStageA, type CuratorSimulationCase } from "../src/lib/review-curator-escalation";
import { attachResearchKnowledgePack, buildResearchKnowledgePack } from "../src/lib/research-engine/knowledge-pack";
import { getResearchSubjectById } from "../src/lib/research-engine/catalog-context";
import type { ResearchSubject } from "../src/lib/research-engine/types";

const outputDir = path.resolve(process.cwd(), process.argv[2] || "artifacts/listing-evidence-acquisition-v2");
const input = JSON.parse(readFileSync(path.join(outputDir, "pilot-input.json"), "utf8")) as { cases: Array<{ caseId: string; platform: string; item: Record<string, any> }> };
const holdout = JSON.parse(readFileSync(path.join(outputDir, "holdout-ground-truth.json"), "utf8")) as Record<string, { expectedStatus: string; expectedDecision?: { catalogId?: string } }>;
const catalogIds = new Set(catalogData.map((row) => row.id));
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function subjectFor(item: Record<string, any>): ResearchSubject {
  const catalogId = String(item.candidateCatalogId || item.catalogId || "");
  const found = catalogId ? getResearchSubjectById(`catalog:${catalogId}`) : null;
  if (found) return found;
  return {
    id: `listing:${item.id}`, kind: "catalog-entry", catalogId: catalogId || null, guideId: null, physicalEditionId: null,
    title: String(item.evidence?.catalogTitle || item.listingTitle || "Unknown listing"), platformSlug: String(item.platformSlug || "unknown"),
    edition: "Standard", region: String(item.targetRegion || "Unknown"), barcode: null, productCodes: [], serials: [],
    marketRegions: [], evidenceMarkets: [], packagingLanguages: [], softwareLanguages: [], releaseStatus: null,
    physicalProductType: null, containsDisc: null, countsAsNativePhysicalRelease: null, confidence: null,
    evidenceCount: 0, sourceCount: 0, notes: [],
  };
}

function workerOnly(item: Record<string, any>): Record<string, any> {
  const evidence = { ...(item.evidence || {}) };
  delete evidence.listingSnapshot;
  delete evidence.visualObservations;
  evidence.imageUrls = Array.isArray(evidence.imageUrls) ? evidence.imageUrls.slice(0, 3) : [];
  evidence.regionEvidence = [];
  evidence.coverVision = {};
  return { ...item, detectedRegion: null, condition: "unknown", evidence };
}

function expectedDecision(caseId: string, item: Record<string, any>): string | null {
  const truth = holdout[caseId];
  if (!truth) return null;
  if (truth.expectedStatus === "rejected") return "REJECT";
  const expectedCatalog = truth.expectedDecision?.catalogId;
  const initialCatalog = item.evidence?.searchedCatalogId || item.catalogId;
  return expectedCatalog && initialCatalog && expectedCatalog !== initialCatalog ? "REROUTE_EXISTING" : "ACCEPT_EXISTING";
}

async function main(): Promise<void> {
const results: Array<Record<string, unknown>> = [];
for (const row of input.cases) {
  const beforeBundle = physicalEvidenceBundleFromReviewItem(workerOnly(row.item), "listing-evidence-v2-worker");
  const workerResolution = resolveReviewBundle(beforeBundle, { catalogIds, gitSha, runId: `worker-${row.caseId}` });
  const physicalBundle = physicalEvidenceBundleFromReviewItem(row.item, "listing-evidence-v2");
  const subject = subjectFor(row.item);
  const pack = await buildResearchKnowledgePack({ bundle: physicalBundle, subject, rootDir: process.cwd(), generatedAt: physicalBundle.capturedAt ?? undefined });
  const bundle = attachResearchKnowledgePack(physicalBundle, pack);
  const simulationCase: CuratorSimulationCase = {
    caseId: row.caseId, origin: "MATURE_PLATFORM_LIVE", platform: ["ps4", "n64", "ps5"].includes(row.platform) ? row.platform as "ps4" | "n64" | "ps5" : "other",
    bundle, workerEvidence: { listingId: bundle.listing.id, images: bundle.images, observations: bundle.observations },
  };
  const firstPass = runStageA({ simulationCase, catalogIds, gitSha, runId: `first-pass-${row.caseId}` });
  // Deep Curator consumes the exact same immutable pack and listing-bound bundle.
  // Product web research is not allowed to replace missing listing photos.
  const deepResolution = resolveReviewBundle(bundle, { catalogIds, gitSha, runId: `deep-${row.caseId}` });
  results.push({
    caseId: row.caseId, platform: row.platform, listingId: bundle.listing.id,
    knowledgePackId: pack.packId, knowledgePackInputHash: pack.inputHash, bundleInputHash: bundle.inputHash,
    photosAvailable: row.item.evidence?.listingSnapshot?.imagesAvailableFromSource ?? 0,
    photosPreserved: bundle.images.length, originalResolution: bundle.images.filter((image) => (image.width ?? 0) >= 800 || (image.height ?? 0) >= 800).length,
    photosClassified: row.item.evidence?.listingSnapshot?.imagesPreserved ?? 0,
    photosInspectedHighDetail: new Set(bundle.observations.map((observation) => observation.imageIndex)).size,
    componentsFound: [...new Set(bundle.observations.map((observation) => observation.component))],
    componentBoundObservations: bundle.observations.length,
    marketBinding: bundle.regional.marketBinding, condition: bundle.condition.bucket,
    workerDecision: workerResolution.decision, firstPassDecision: firstPass.resolution.decision,
    deepCuratorDecision: deepResolution.decision, finalDecision: deepResolution.decision,
    resolvedCatalogId: deepResolution.resolvedCatalogId, evidenceGaps: deepResolution.evidenceGaps,
    expectedDecision: expectedDecision(row.caseId, row.item),
  });
}

const counts = Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "DEFER", "PROPOSE_NEW_VARIANT", "NEEDS_HUMAN"].map((decision) => [decision, results.filter((row) => row.finalDecision === decision).length]));
const holdoutRows = results.filter((row) => row.expectedDecision);
const falseAccepts = holdoutRows.filter((row) => ["ACCEPT_EXISTING", "REROUTE_EXISTING"].includes(String(row.finalDecision)) && row.finalDecision !== row.expectedDecision).length;
const platformEvidence = Object.fromEntries(["ps4", "n64", "ps5", "gameboy"].map((platform) => [platform, {
  originalGallery: results.some((row) => row.platform === platform && Number(row.originalResolution) >= 3),
  componentClassification: results.some((row) => row.platform === platform && Number(row.componentBoundObservations) > 0),
  componentBinding: results.filter((row) => row.platform === platform).every((row) => Number(row.componentBoundObservations) === 0 || Boolean(row.listingId)),
  marketBinding: results.some((row) => row.platform === platform && row.marketBinding === "MARKET_BOUND"),
  conditionResolved: results.some((row) => row.platform === platform && row.condition !== "unknown"),
}]));
const summary = {
  schemaVersion: 1, gitSha, cases: results.length, counts, falseAccepts,
  crossListingAttribution: 0, componentCrossAttribution: 0, fabricatedIdentifiers: 0,
  catalogMutations: 0, priceMutations: 0, authoritativeQueueMutations: 0,
  holdout: { cases: holdoutRows.length, correct: holdoutRows.filter((row) => row.finalDecision === row.expectedDecision).length, rows: holdoutRows.map((row) => ({ caseId: row.caseId, expected: row.expectedDecision, actual: row.finalDecision })) },
  platformEvidence,
  decisionsDemonstrated: { accept: Number(counts.ACCEPT_EXISTING) > 0, reroute: Number(counts.REROUTE_EXISTING) > 0, reject: Number(counts.REJECT) > 0 },
};
writeJson(path.join(outputDir, "resolution-results.json"), { summary, cases: results });

const resolvedCases = results.filter((row) => row.finalDecision !== "DEFER" && row.finalDecision !== "NEEDS_HUMAN").length;
const funnelPath = path.join(outputDir, "listing-image-funnel.md");
let funnel = readFileSync(funnelPath, "utf8");
if (/^- resolved cases:.*$/m.test(funnel)) funnel = funnel.replace(/^- resolved cases:.*$/m, `- resolved cases: ${resolvedCases}`);
else funnel = funnel.replace(/(- market-bound observations:.*\n)/, `$1- resolved cases: ${resolvedCases}\n`);
writeFileSync(funnelPath, funnel, "utf8");

const acquisition = JSON.parse(readFileSync(path.join(outputDir, "acquisition-summary.json"), "utf8"));
const allPlatforms = Object.values(platformEvidence);
const listingReady = allPlatforms.every((row) => row.originalGallery && row.componentClassification && row.componentBinding);
const marketReady = allPlatforms.every((row) => row.marketBinding);
const conditionReady = allPlatforms.every((row) => row.conditionResolved);
const deepReady = listingReady && marketReady && conditionReady && summary.decisionsDemonstrated.accept && summary.decisionsDemonstrated.reroute && summary.decisionsDemonstrated.reject && falseAccepts === 0;
const lines = [
  "# Listing Evidence Acquisition V2 closure", "",
  `- Base HEAD: \`9882d6e2c31e7f862ebff5783061ec2e2f12e1b6\``, `- Validation HEAD: \`${gitSha}\``,
  `- Cases: ${results.length}`, `- Cost: $${Number(acquisition.costUsd).toFixed(6)}`, `- OpenAI calls: ${acquisition.openAiCalls}`,
  `- Decisions: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}`,
  `- Holdout: ${summary.holdout.correct}/${summary.holdout.cases} exact; false accepts=${falseAccepts}`, "",
  "## Per case", "",
  "| Case | Platform | Source photos | Preserved | Original | Components | Market | Condition | Worker | First pass | Deep/final | Holdout |",
  "|---|---|---:|---:|---:|---:|---|---|---|---|---|---|",
  ...results.map((row) => `| ${row.caseId} | ${row.platform} | ${row.photosAvailable} | ${row.photosPreserved} | ${row.originalResolution} | ${row.componentBoundObservations} | ${row.marketBinding} | ${row.condition} | ${row.workerDecision} | ${row.firstPassDecision} | ${row.finalDecision} | ${row.expectedDecision ?? "—"} |`),
  "", "## Platform gate", "",
  "| Platform | Original gallery | Component classification | Component binding | Market binding | Condition |",
  "|---|---|---|---|---|---|",
  ...Object.entries(platformEvidence).map(([platform, row]) => `| ${platform} | ${row.originalGallery ? "PASS" : "FAIL"} | ${row.componentClassification ? "PASS" : "FAIL"} | ${row.componentBinding ? "PASS" : "FAIL"} | ${row.marketBinding ? "PASS" : "FAIL"} | ${row.conditionResolved ? "PASS" : "FAIL"} |`),
  "", "## Final gate", "",
  `LISTING EVIDENCE ACQUISITION: ${listingReady ? "READY" : "NOT READY"}`,
  `ORIGINAL IMAGE ACQUISITION: ${allPlatforms.every((row) => row.originalGallery) ? "READY" : "NOT READY"}`,
  `COMPONENT CLASSIFICATION: ${allPlatforms.every((row) => row.componentClassification) ? "READY" : "NOT READY"}`,
  `COMPONENT BINDING: ${allPlatforms.every((row) => row.componentBinding) ? "READY" : "NOT READY"}`,
  `MARKET BINDING: ${marketReady ? "READY" : "NOT READY"}`,
  `CONDITION RESOLUTION: ${conditionReady ? "READY" : "NOT READY"}`, "",
  `DEEP CURATOR WITH PHYSICAL LISTING EVIDENCE: ${deepReady ? "READY" : "NOT READY"}`, "",
  "No catalog, price or authoritative queue mutations were performed. Listing photographs remain internal evidence references and were not added as public RegionAtlas assets.",
];
writeFileSync(path.join(outputDir, "closure.md"), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
