#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- benchmark boundaries read frozen JSON. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import {
  curatorHash,
  physicalEvidenceBundleFromReviewItem,
  resolveReviewBundle,
  type PhysicalEvidenceBundleV1,
} from "../src/lib/review-curator";
import { attachResearchKnowledgePack, buildResearchKnowledgePack } from "../src/lib/research-engine/knowledge-pack";
import { runDurableResearchTask } from "../src/lib/research-engine/runtime";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";
import type { ResearchSubject } from "../src/lib/research-engine/types";
import type { DurableResearchTask, ResearchEvidenceRecord, ResearchTargetField } from "../src/lib/research-engine/v2-types";

const OUTPUT_DIR = path.resolve(process.cwd(), process.argv[2] || "artifacts/engine-codex-review-benchmark");
const NOW = new Date().toISOString();
const BRAVE_REQUEST_USD = 0.005;
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const catalogIds = new Set(catalogData.map((row) => row.id));

type AcquisitionRow = {
  caseId: string;
  platform: string;
  subjectTitle: string;
  availability: string;
  availabilityReason?: string;
  item: Record<string, any> | null;
  costUsd: number;
  openAiCalls: number;
  selectionInputHash?: string;
  selectionGalleryHash?: string;
};

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function subjectFor(bundle: PhysicalEvidenceBundleV1): ResearchSubject {
  const catalogId = bundle.catalog.candidateCatalogId || bundle.catalog.searchedCatalogId;
  const catalog = catalogData.find((row) => row.id === catalogId);
  return {
    id: `benchmark:${bundle.reviewItemId}`,
    kind: "catalog-entry",
    catalogId: catalogId || null,
    guideId: null,
    physicalEditionId: null,
    title: catalog?.title || bundle.subject.identity || bundle.listing.title,
    platformSlug: bundle.subject.platform || catalog?.platformSlug || "unknown",
    edition: bundle.subject.edition || catalog?.edition || "standard",
    region: bundle.regional.targetRegion || catalog?.region || "unknown",
    barcode: bundle.identifiers.find((row) => row.type === "EAN_UPC")?.value || null,
    productCodes: bundle.identifiers.filter((row) => row.type === "PRODUCT_CODE").map((row) => row.value),
    serials: bundle.identifiers.filter((row) => row.type === "SERIAL").map((row) => row.value),
    marketRegions: bundle.regional.targetRegion ? [bundle.regional.targetRegion] : [],
    evidenceMarkets: [],
    packagingLanguages: bundle.regional.packagingLanguages,
    softwareLanguages: [],
    releaseStatus: null,
    physicalProductType: "PHYSICAL_FULL_GAME",
    containsDisc: ["ps4", "ps5"].includes(bundle.subject.platform || "") ? true : null,
    countsAsNativePhysicalRelease: true,
    confidence: null,
    evidenceCount: bundle.confirmed.length,
    sourceCount: 1,
    notes: [
      `Frozen listing: ${bundle.listing.url || "unavailable"}`,
      `Listing title: ${bundle.listing.title}`,
      "Ground truth and later Codex decisions are withheld from the Engine.",
    ],
  };
}

function primaryTarget(bundle: PhysicalEvidenceBundleV1): ResearchTargetField {
  if (["n64", "gameboy"].includes(bundle.subject.platform || "") && !bundle.identifiers.some((row) => row.type === "PRODUCT_CODE" || row.type === "SERIAL")) return "PRODUCT_CODE";
  if (bundle.regional.marketBinding !== "MARKET_BOUND") return "MARKET_REGION";
  if (!bundle.confirmed.includes("identity")) return "CANONICAL_IDENTITY";
  return "BARCODE";
}

function taskFor(bundle: PhysicalEvidenceBundleV1, targetField: ResearchTargetField): DurableResearchTask {
  const gap = bundle.evidenceGaps.find((row) => row.field === targetField) || bundle.evidenceGaps[0];
  return {
    id: `benchmark-engine-${curatorHash({ reviewItemId: bundle.reviewItemId, targetField, evidenceHash: bundle.evidenceHash }).slice(0, 24)}`,
    subjectId: subjectFor(bundle).id,
    targetField,
    question: ["n64", "gameboy"].includes(bundle.subject.platform || "")
      ? `Research the exact physical family for ${bundle.subject.identity}; preserve box, cartridge and manual codes separately and identify regional-title relationships.`
      : `Resolve ${targetField} for the exact ${bundle.subject.platform} standard physical product ${bundle.subject.identity}; compare regional siblings and do not infer a country from language, rating or seller location.`,
    priority: "P2",
    evidenceNeeded: [gap?.missingProof || "Independent exact-product evidence"],
    riskCodes: targetField === "MARKET_REGION" ? ["MISSING_MARKET_MAPPING", "GENERIC_REGION"] : ["WEAK_OR_MISSING_EVIDENCE", "PENDING_IDENTIFIER"],
    status: "PENDING",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function augmentBundle(bundle: PhysicalEvidenceBundleV1, target: ResearchTargetField, research: Awaited<ReturnType<typeof runDurableResearchTask>>): PhysicalEvidenceBundleV1 {
  if (research.state.status !== "CONFIRMED" || research.resolution.status !== "CONFIRMED") return bundle;
  if (target === "MARKET_REGION" && Number(research.state.physicalMetrics?.marketBoundClaims || 0) > 0 && typeof research.resolution.value === "string") {
    return {
      ...bundle,
      regional: {
        ...bundle.regional,
        detectedRegion: research.resolution.value,
        marketBinding: "MARKET_BOUND",
        evidence: unique([...bundle.regional.evidence, "engine_research_market_bound"]),
      },
      confirmed: unique([...bundle.confirmed, "market_region"]),
      uncertain: bundle.uncertain.filter((row) => row !== "market_region"),
      evidenceGaps: bundle.evidenceGaps.filter((row) => row.field !== "MARKET_REGION"),
    };
  }
  if (target === "CANONICAL_IDENTITY" && research.state.evidence.some((row) => row.listingId === bundle.listing.id)) {
    return {
      ...bundle,
      confirmed: unique([...bundle.confirmed, "identity"]),
      uncertain: bundle.uncertain.filter((row) => row !== "identity"),
      evidenceGaps: bundle.evidenceGaps.filter((row) => row.field !== "CANONICAL_IDENTITY"),
    };
  }
  if (["PRODUCT_CODE", "BARCODE", "SERIAL"].includes(target)) {
    const additions = research.state.identifiersSeen.flatMap((identifier, index) => {
      if (!identifier.component) return [];
      const type = /EAN|UPC|BARCODE/.test(identifier.type.toUpperCase()) ? "EAN_UPC" as const
        : /SERIAL/.test(identifier.type.toUpperCase()) ? "SERIAL" as const : "PRODUCT_CODE" as const;
      return [{ type, value: identifier.value, component: identifier.component, observationId: `engine-research-${index + 1}` }];
    });
    return { ...bundle, identifiers: [...bundle.identifiers, ...additions.filter((row) => !bundle.identifiers.some((existing) => existing.type === row.type && existing.value === row.value && existing.component === row.component))] };
  }
  return bundle;
}

function acquisitionLedger(bundle: PhysicalEvidenceBundleV1): Array<Record<string, unknown>> {
  return bundle.observations.map((observation) => ({
    evidenceId: observation.id,
    claim: {
      text: observation.textSnippets,
      productCodes: observation.productCodes,
      serials: observation.serials || [],
      barcodes: observation.barcodes,
      languages: observation.languages,
      distributors: observation.distributors,
      editionMarkers: observation.editionMarkers,
    },
    source: bundle.source,
    sourceUrl: bundle.listing.url,
    component: observation.component,
    listingId: observation.listingId || bundle.listing.id,
    imageIndex: observation.imageIndex,
    identifier: unique([...observation.barcodes, ...observation.productCodes, ...(observation.serials || [])]),
    origin: "ENGINE",
    decisive: false,
  }));
}

function researchLedger(evidence: ResearchEvidenceRecord[]): Array<Record<string, unknown>> {
  return evidence.map((row) => ({
    evidenceId: row.id,
    claim: row.relevantExcerpt || row.evidenceType,
    source: row.sourceId,
    sourceUrl: row.sourceUrl,
    component: row.component,
    listingId: row.listingId,
    imageIndex: null,
    identifier: (row.extractedIdentifiers || []).map((identifier) => `${identifier.type}:${identifier.value}`),
    origin: "ENGINE",
    decisive: false,
  }));
}

async function main(): Promise<void> {
  const input = JSON.parse(readFileSync(path.join(OUTPUT_DIR, "engine-input.json"), "utf8")) as { cases: AcquisitionRow[]; preflight: Record<string, unknown>; costUsd: number; openAiCalls: number };
  const selection = JSON.parse(readFileSync(path.join(OUTPUT_DIR, "selected-listings.json"), "utf8")) as { freezeHash: string; cases: Array<Record<string, any>> };
  const store = new ResearchRunStore(path.join(OUTPUT_DIR, "engine-research"));
  const results: Array<Record<string, any>> = [];
  for (const row of input.cases) {
    if (row.availability !== "USABLE" || !row.item) {
      results.push({ caseId: row.caseId, game: row.subjectTitle, platform: row.platform, availability: "CASE_UNAVAILABLE", availabilityReason: row.availabilityReason, engineDecision: null });
      continue;
    }
    process.stdout.write(`ENGINE_CASE_START ${row.caseId}\n`);
    const baseBundle = physicalEvidenceBundleFromReviewItem(row.item, selection.freezeHash);
    const pack = await buildResearchKnowledgePack({ bundle: baseBundle, subject: subjectFor(baseBundle), rootDir: process.cwd(), generatedAt: baseBundle.capturedAt || NOW });
    const bundle = attachResearchKnowledgePack(baseBundle, pack);
    const initialResolution = resolveReviewBundle(bundle, { catalogIds, gitSha, runId: `benchmark-engine-initial-${row.caseId}`, now: NOW });
    let finalBundle = bundle;
    let research: Awaited<ReturnType<typeof runDurableResearchTask>> | null = null;
    let researchError: string | null = null;
    let targetField: ResearchTargetField | null = null;
    if (initialResolution.decision === "DEFER") {
      targetField = primaryTarget(bundle);
      try {
        research = await runDurableResearchTask({
          task: taskFor(bundle, targetField),
          subject: subjectFor(bundle),
          rootDir: process.cwd(),
          store,
          runId: `benchmark-engine-${row.caseId.toLowerCase()}-${Date.now().toString(36)}`,
          knowledgePack: pack,
        });
        finalBundle = augmentBundle(bundle, targetField, research);
      } catch (error) {
        researchError = error instanceof Error ? error.message : String(error);
      }
    }
    const finalResolution = resolveReviewBundle(finalBundle, { catalogIds, gitSha, runId: `benchmark-engine-final-${row.caseId}`, now: NOW });
    const decision = finalResolution.decision === "DEFER" ? "REVIEW_REQUIRED" : finalResolution.decision;
    const researchEvidence = researchLedger(research?.state.evidence || []);
    const ledger = [...acquisitionLedger(bundle), ...researchEvidence];
    const decisiveIds = new Set([...(finalResolution.evidenceIds || []), ...(research?.resolution.sourceIds || [])]);
    for (const evidence of ledger) evidence.decisive = decisiveIds.has(String(evidence.evidenceId));
    const braveWeb = Number(research?.providerUsage["brave-search"] || 0);
    const braveImages = Number(research?.providerUsage["brave-images"] || 0);
    const researchAiCost = Number(research?.state.usage.estimatedCostUsd || 0);
    const engineResult: Record<string, any> = {
      schemaVersion: 1,
      benchmark: "PILOT_16",
      caseId: row.caseId,
      game: row.subjectTitle,
      platform: row.platform,
      listingId: finalBundle.listing.id,
      listingUrl: finalBundle.listing.url,
      inputHash: row.selectionInputHash,
      galleryHash: row.selectionGalleryHash,
      knowledgePackHash: pack.inputHash,
      evidenceHash: finalBundle.evidenceHash,
      initialEngineDecision: initialResolution.decision === "DEFER" ? "REVIEW_REQUIRED" : initialResolution.decision,
      engineDecision: decision,
      engineConfidence: finalResolution.confidence,
      searchedCatalogId: finalBundle.catalog.searchedCatalogId,
      candidateCatalogId: finalBundle.catalog.candidateCatalogId,
      resolvedCatalogId: finalResolution.resolvedCatalogId,
      variantBinding: finalBundle.confirmed.includes("identity") ? "PRODUCT_BOUND" : "UNBOUND",
      marketBinding: finalBundle.regional.marketBinding,
      detectedMarket: finalBundle.regional.detectedRegion,
      condition: finalBundle.condition,
      confirmedClaims: finalBundle.confirmed,
      uncertainClaims: finalBundle.uncertain,
      rejectedClaims: unique([...finalBundle.rejected, ...finalBundle.conflicts]),
      evidenceUsed: ledger,
      sourcesConsulted: unique(researchEvidence.map((entry) => String(entry.source))),
      queriesExecuted: research?.state.queriesAttempted || [],
      listingImagesUsed: unique(finalBundle.observations.map((observation) => observation.imageIndex)),
      componentObservations: finalBundle.observations,
      identifiersFound: unique([
        ...finalBundle.identifiers.map((identifier) => `${identifier.type}:${identifier.value}:${identifier.component}`),
        ...(research?.state.identifiersSeen || []).map((identifier) => `${identifier.type}:${identifier.value}:${identifier.component || "UNBOUND"}`),
      ]),
      remainingEvidenceGaps: finalResolution.evidenceGaps,
      reasonForReview: decision === "REVIEW_REQUIRED" ? finalResolution.reason : null,
      research: {
        targetField,
        status: research?.state.status || (researchError ? "BLOCKED" : "NOT_NEEDED"),
        resolution: research?.resolution || null,
        error: researchError,
        technicalFailures: research?.technicalFailures || [],
        imagesInspected: research?.funnel.imagesInspected || 0,
      },
      cost: {
        retrievalUsd: (braveWeb + braveImages) * BRAVE_REQUEST_USD,
        aiUsd: row.costUsd + researchAiCost,
        totalUsd: row.costUsd + researchAiCost + (braveWeb + braveImages) * BRAVE_REQUEST_USD,
        braveWeb,
        braveImages,
        acquisitionAiCalls: row.openAiCalls,
        researchAiCalls: research?.state.usage.agentTurns || 0,
      },
      preflight: input.preflight[row.caseId],
      frozenAt: new Date().toISOString(),
      engineResultImmutable: true,
    };
    engineResult.engineResultHash = curatorHash(engineResult);
    writeJson(path.join(OUTPUT_DIR, "cases", row.caseId, "engine-result.json"), engineResult);
    results.push(engineResult);
    process.stdout.write(`ENGINE_CASE_FROZEN ${row.caseId} ${decision} ${engineResult.engineResultHash}\n`);
  }
  const usable = results.filter((row) => row.availability !== "CASE_UNAVAILABLE");
  const decided = usable.filter((row) => row.engineDecision !== "REVIEW_REQUIRED");
  const review = usable.filter((row) => row.engineDecision === "REVIEW_REQUIRED");
  const scorecard = {
    schemaVersion: 1,
    benchmark: "PILOT_16",
    gitSha,
    selectionFreezeHash: selection.freezeHash,
    totalSelectedGames: selection.cases.length,
    usableCases: usable.length,
    unavailableCases: results.length - usable.length,
    engineDecided: decided.length,
    reviewRequired: review.length,
    decisions: Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "PROPOSE_NEW_VARIANT", "REVIEW_REQUIRED"].map((decision) => [decision, usable.filter((row) => row.engineDecision === decision).length])),
    costs: {
      acquisitionAiUsd: input.costUsd,
      retrievalUsd: usable.reduce((sum, row) => sum + Number(row.cost?.retrievalUsd || 0), 0),
      researchAiUsd: usable.reduce((sum, row) => sum + Math.max(0, Number(row.cost?.aiUsd || 0) - Number(input.cases.find((item) => item.caseId === row.caseId)?.costUsd || 0)), 0),
      totalUsd: usable.reduce((sum, row) => sum + Number(row.cost?.totalUsd || 0), 0),
    },
    mutations: { catalog: 0, prices: 0, authoritativeQueue: 0, publicAssets: 0 },
    cases: results.map((row) => ({
      caseId: row.caseId, game: row.game, platform: row.platform, availability: row.availability || "USABLE",
      availabilityReason: row.availabilityReason || null, engineDecision: row.engineDecision, engineResultHash: row.engineResultHash || null,
      cost: row.cost || null,
    })),
  };
  writeJson(path.join(OUTPUT_DIR, "engine-scorecard.json"), scorecard);
  writeJson(path.join(OUTPUT_DIR, "codex-review-queue.json"), {
    schemaVersion: 1,
    createdAfterEngineFreeze: true,
    entries: review.map((row) => ({
      caseId: row.caseId,
      engineResultHash: row.engineResultHash,
      engineResultPath: `cases/${row.caseId}/engine-result.json`,
      confirmedClaims: row.confirmedClaims,
      rejectedClaims: row.rejectedClaims,
      identifiers: row.identifiersFound,
      images: row.componentObservations,
      sourcesConsulted: row.sourcesConsulted,
      queriesAlreadyPerformed: row.queriesExecuted,
      sourcesExhausted: row.sourcesConsulted,
      remainingEvidenceGaps: row.remainingEvidenceGaps,
    })),
  });
  process.stdout.write(`${JSON.stringify({ usable: usable.length, decided: decided.length, reviewRequired: review.length, costUsd: scorecard.costs.totalUsd }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
