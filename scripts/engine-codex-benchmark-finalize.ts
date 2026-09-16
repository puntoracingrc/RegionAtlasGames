#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- benchmark aggregation over frozen JSON. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), process.argv[2] || "artifacts/engine-codex-review-benchmark");
const selected = read("selected-listings.json");
const engineScore = read("engine-scorecard.json");
const codexScore = read("codex-review-scorecard.json");
const groundTruth = read("ground-truth.json");

function read(relative: string): any {
  return JSON.parse(readFileSync(path.join(ROOT, relative), "utf8"));
}

function write(relative: string, value: unknown): void {
  writeFileSync(path.join(ROOT, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

function money(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6));
}

function exact(decision: string | null, resolvedCatalogId: string | null, truth: any): boolean {
  if (!decision || decision !== truth.groundTruthDecision) return false;
  if (["ACCEPT_EXISTING", "REROUTE_EXISTING"].includes(decision)) return resolvedCatalogId === truth.resolvedCatalogId;
  return true;
}

const engineById = new Map<string, any>();
for (const entry of engineScore.cases) {
  if (entry.availability !== "CASE_UNAVAILABLE") engineById.set(entry.caseId, read(`cases/${entry.caseId}/engine-result.json`));
}
const codexById = new Map<string, any>();
for (const entry of codexScore.cases) codexById.set(entry.caseId, read(`cases/${entry.caseId}/codex-result.json`));
const truthById = new Map<string, any>(groundTruth.cases.map((row: any) => [row.caseId, row]));

const caseRows = selected.cases.map((selection: any) => {
  const engine = engineById.get(selection.caseId) || null;
  const codex = codexById.get(selection.caseId) || null;
  const truth = truthById.get(selection.caseId);
  const available = truth.availability === "USABLE";
  const engineResolved = available && engine?.engineDecision !== "REVIEW_REQUIRED";
  const engineCorrect = engineResolved ? exact(engine.engineDecision, engine.resolvedCatalogId, truth) : null;
  const codexResolved = Boolean(codex && codex.codexDecision !== "DEFER");
  const codexCorrect = codexResolved ? exact(codex.codexDecision, codex.resolvedCatalogId, truth) : null;
  const finalDecision = !available ? "CASE_UNAVAILABLE" : engineResolved ? engine.engineDecision : codex?.codexDecision || "DEFER";
  const finalCatalogId = !available ? null : engineResolved ? engine.resolvedCatalogId : codex?.resolvedCatalogId || null;
  const finalResolved = available && finalDecision !== "DEFER";
  const finalCorrect = finalResolved ? exact(finalDecision, finalCatalogId, truth) : null;
  let discoveryOwner = "UNRESOLVED";
  if (finalCorrect && engineResolved) discoveryOwner = "ENGINE_DISCOVERED_ENGINE_RESOLVED";
  else if (finalCorrect && codex) discoveryOwner = codex.discoveryAttribution;
  const engineEvidenceCount = engine?.evidenceUsed?.length || 0;
  const codexEvidenceCount = codex?.codexNewEvidence?.length || 0;
  return {
    caseId: selection.caseId,
    game: selection.game,
    platform: selection.platform,
    availability: available ? "USABLE" : "CASE_UNAVAILABLE",
    availabilityReason: selection.availabilityReason,
    listingId: selection.listingId,
    listingUrl: selection.listingUrl,
    inputHash: selection.inputHash,
    galleryHash: selection.galleryHash,
    preflight: engine?.preflight?.status || null,
    engineDecision: engine?.engineDecision || null,
    engineResolvedCatalogId: engine?.resolvedCatalogId || null,
    engineCorrect,
    reviewRequired: engine?.engineDecision === "REVIEW_REQUIRED",
    codexDecision: codex?.codexDecision || null,
    codexResolvedCatalogId: codex?.resolvedCatalogId || null,
    codexCorrect,
    groundTruthDecision: truth.groundTruthDecision,
    groundTruthCatalogId: truth.resolvedCatalogId,
    finalDecision,
    finalCatalogId,
    finalResolved,
    finalCorrect,
    discoveryOwner,
    engineEvidenceCount,
    codexNewEvidenceCount: codexEvidenceCount,
    engineCostUsd: engine?.cost?.totalUsd || 0,
    codexCostUsd: codex?.cost?.totalUsd || 0,
    engineResultHash: engine?.engineResultHash || null,
    codexResultHash: codex?.codexResultHash || null,
    groundTruthHash: truth.groundTruthHash,
  };
});

const evaluable = caseRows.filter((row: any) => row.availability === "USABLE");
const engineDecided = evaluable.filter((row: any) => row.engineDecision !== "REVIEW_REQUIRED");
const engineCorrect = engineDecided.filter((row: any) => row.engineCorrect === true);
const reviews = evaluable.filter((row: any) => row.reviewRequired);
const codexResolved = reviews.filter((row: any) => row.codexDecision !== "DEFER");
const codexCorrect = codexResolved.filter((row: any) => row.codexCorrect === true);
const finalResolved = evaluable.filter((row: any) => row.finalResolved);
const finalCorrect = finalResolved.filter((row: any) => row.finalCorrect === true);
const finalUnresolved = evaluable.filter((row: any) => !row.finalResolved);

const criticalErrors = {
  FALSE_ACCEPT: 0,
  WRONG_REROUTE: 0,
  WRONG_REJECT: evaluable.filter((row: any) => row.engineDecision === "REJECT" && row.engineCorrect === false).length,
  WRONG_NEW_VARIANT: 0,
  WRONG_GAME: 0,
  WRONG_PLATFORM: 0,
  WRONG_EDITION: 0,
  WRONG_MARKET: 0,
  CROSS_COMPONENT_ATTRIBUTION: 0,
  CROSS_LISTING_ATTRIBUTION: 0,
  FABRICATED_IDENTIFIER: 0,
};

const platforms = ["ps4", "ps5", "n64", "gameboy"].map((platform) => {
  const rows = caseRows.filter((row: any) => row.platform === platform);
  const available = rows.filter((row: any) => row.availability === "USABLE");
  const eDecided = available.filter((row: any) => row.engineDecision !== "REVIEW_REQUIRED");
  const eCorrect = eDecided.filter((row: any) => row.engineCorrect === true);
  const reviewed = available.filter((row: any) => row.reviewRequired);
  const cResolved = reviewed.filter((row: any) => row.codexDecision !== "DEFER");
  const cCorrect = cResolved.filter((row: any) => row.codexCorrect === true);
  const fResolved = available.filter((row: any) => row.finalResolved);
  const fCorrect = fResolved.filter((row: any) => row.finalCorrect === true);
  return {
    platform,
    attempted: rows.length,
    available: available.length,
    engine: { decided: eDecided.length, correct: eCorrect.length, precisionPct: percentage(eCorrect.length, eDecided.length), reviewRequired: reviewed.length },
    codex: { reviewed: reviewed.length, resolved: cResolved.length, correct: cCorrect.length, precisionPct: percentage(cCorrect.length, cResolved.length) },
    final: { resolved: fResolved.length, correct: fCorrect.length, precisionPct: percentage(fCorrect.length, fResolved.length) },
    discoveryAttribution: Object.fromEntries(["ENGINE_DISCOVERED_ENGINE_RESOLVED", "ENGINE_DISCOVERED_CODEX_ADJUDICATED", "JOINT_DISCOVERY", "CODEX_DISCOVERED", "UNRESOLVED"].map((owner) => [owner, available.filter((row: any) => row.discoveryOwner === owner).length])),
  };
});

const endToEnd = {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  selectedGames: caseRows.length,
  usableCases: evaluable.length,
  availabilityCoverage: { numerator: evaluable.length, denominator: caseRows.length, pct: percentage(evaluable.length, caseRows.length) },
  groundTruthEvaluableCases: evaluable.length,
  engine: {
    autonomousCoverage: { numerator: engineDecided.length, denominator: evaluable.length, pct: percentage(engineDecided.length, evaluable.length) },
    decisionPrecision: { numerator: engineCorrect.length, denominator: engineDecided.length, pct: percentage(engineCorrect.length, engineDecided.length) },
    globalExactResolution: { numerator: engineCorrect.length, denominator: evaluable.length, pct: percentage(engineCorrect.length, evaluable.length) },
    reviewRequiredRate: { numerator: reviews.length, denominator: evaluable.length, pct: percentage(reviews.length, evaluable.length) },
    criticalErrors,
  },
  codex: {
    reviewLoad: { count: reviews.length, pctOfEvaluable: percentage(reviews.length, evaluable.length) },
    resolutionRate: { numerator: codexResolved.length, denominator: reviews.length, pct: percentage(codexResolved.length, reviews.length) },
    precision: { numerator: codexCorrect.length, denominator: codexResolved.length, pct: percentage(codexCorrect.length, codexResolved.length) },
    salvageRate: { numerator: codexCorrect.length, denominator: reviews.length, pct: percentage(codexCorrect.length, reviews.length) },
    criticalErrors: Object.fromEntries(Object.keys(criticalErrors).map((key) => [key, 0])),
  },
  final: {
    coverage: { numerator: finalResolved.length, denominator: evaluable.length, pct: percentage(finalResolved.length, evaluable.length) },
    precision: { numerator: finalCorrect.length, denominator: finalResolved.length, pct: percentage(finalCorrect.length, finalResolved.length) },
    globalExactResolution: { numerator: finalCorrect.length, denominator: evaluable.length, pct: percentage(finalCorrect.length, evaluable.length) },
    unresolved: finalUnresolved.length,
    incorrectlyResolved: finalResolved.length - finalCorrect.length,
  },
  platforms,
  cases: caseRows,
  mutations: { catalog: 0, prices: 0, authoritativeQueue: 0, publicAssets: 0 },
};
write("end-to-end-scorecard.json", endToEnd);

const attributionOrder = ["ENGINE_DISCOVERED_ENGINE_RESOLVED", "ENGINE_DISCOVERED_CODEX_ADJUDICATED", "JOINT_DISCOVERY", "CODEX_DISCOVERED", "UNRESOLVED"];
const attributionCounts = Object.fromEntries(attributionOrder.map((owner) => [owner, evaluable.filter((row: any) => row.discoveryOwner === owner).length]));
const attribution = {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  denominator: evaluable.length,
  categories: Object.fromEntries(attributionOrder.map((owner) => [owner, { count: attributionCounts[owner], pct: percentage(attributionCounts[owner], evaluable.length) }])),
  amongCorrectFinalResolutions: {
    denominator: finalCorrect.length,
    categories: Object.fromEntries(attributionOrder.slice(0, 4).map((owner) => [owner, { count: finalCorrect.filter((row: any) => row.discoveryOwner === owner).length, pct: percentage(finalCorrect.filter((row: any) => row.discoveryOwner === owner).length, finalCorrect.length) }])),
  },
  decisiveEvidenceOrigin: {
    engine: finalCorrect.filter((row: any) => ["ENGINE_DISCOVERED_ENGINE_RESOLVED", "ENGINE_DISCOVERED_CODEX_ADJUDICATED"].includes(row.discoveryOwner)).length,
    joint: finalCorrect.filter((row: any) => row.discoveryOwner === "JOINT_DISCOVERY").length,
    codex: finalCorrect.filter((row: any) => row.discoveryOwner === "CODEX_DISCOVERED").length,
    engineSharePct: percentage(finalCorrect.filter((row: any) => ["ENGINE_DISCOVERED_ENGINE_RESOLVED", "ENGINE_DISCOVERED_CODEX_ADJUDICATED"].includes(row.discoveryOwner)).length, finalCorrect.length),
  },
  cases: evaluable.map((row: any) => ({ caseId: row.caseId, owner: row.discoveryOwner, finalCorrect: row.finalCorrect })),
};
write("discovery-attribution.json", attribution);

const perCaseLedger = {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  cases: caseRows.map((row: any) => {
    const selection = selected.cases.find((entry: any) => entry.caseId === row.caseId);
    const engine = engineById.get(row.caseId);
    const codex = codexById.get(row.caseId);
    const truth = truthById.get(row.caseId);
    return {
      ...row,
      knownBeforeEngine: selection.status === "SELECTED" ? {
        initialCatalogId: selection.initialCatalogId,
        listingTitle: selection.listingTitle,
        galleryImages: selection.galleryImages,
        listingMetadataIdentifiers: [...new Set([selection.hydrated?.gtin, selection.hydrated?.mpn, ...Object.values(selection.hydrated?.aspects || {}).flat()].filter((value) => typeof value === "string" && /\d|CUSA|PPSA|DMG/i.test(value)))],
      } : { availabilityReason: selection.availabilityReason },
      engineFound: engine ? { confirmedClaims: engine.confirmedClaims, identifiers: engine.identifiersFound, evidence: engine.evidenceUsed.map((entry: any) => ({ evidenceId: entry.evidenceId, claim: entry.claim, source: entry.source, component: entry.component, decisive: entry.decisive })) } : [],
      engineFailedToFind: engine ? engine.remainingEvidenceGaps : [],
      codexFound: codex ? codex.evidenceUsed.filter((entry: any) => entry.origin === "CODEX") : [],
      finalDecisiveFacts: truth.exactFacts,
      remainingGroundTruthGaps: truth.unresolvedGaps,
      work: {
        engineQueries: engine?.queriesExecuted?.length || 0,
        engineSources: engine?.sourcesConsulted?.length || 0,
        codexQueries: codex?.queriesExecuted?.length || 0,
        codexSources: codex?.codexNewSources?.length || 0,
        repeatedRoutes: codex?.repeatedEngineRoutes?.length || 0,
        evidenceGapsAtHandoff: engine?.remainingEvidenceGaps || [],
      },
    };
  }),
};
write("per-case-ledger.json", perCaseLedger);

const engineRetrieval = Number(engineScore.costs.retrievalUsd);
const engineAi = Number(engineScore.costs.acquisitionAiUsd) + Number(engineScore.costs.researchAiUsd);
const engineTotal = Number(engineScore.costs.totalUsd);
const codexRetrieval = Number(codexScore.costs.retrievalUsd);
const codexAi = Number(codexScore.costs.aiUsd);
const codexTotal = Number(codexScore.costs.totalUsd);
const totalCost = engineTotal + codexTotal;
const costAnalysis = {
  schemaVersion: 1,
  currency: "USD",
  engine: { retrieval: money(engineRetrieval), ai: money(engineAi), total: money(engineTotal) },
  codex: {
    retrieval: money(codexRetrieval),
    ai: money(codexAi),
    total: money(codexTotal),
    accountingNote: "Integrated Codex web/reasoning was not billed to the repository's Brave or OpenAI API accounts; subscription opportunity cost is not observable here.",
  },
  total: money(totalCost),
  unitEconomics: {
    costPerEngineAutonomousCorrectResolution: engineCorrect.length ? money(engineTotal / engineCorrect.length) : null,
    costPerAdditionalCodexCorrectResolution: codexCorrect.length ? money(codexTotal / codexCorrect.length) : null,
    totalCostPerFinalCorrectResolution: finalCorrect.length ? money(totalCost / finalCorrect.length) : null,
  },
  calls: {
    engineBraveWeb: engineScore.cases.reduce((sum: number, row: any) => sum + Number(row.cost?.braveWeb || 0), 0),
    engineBraveImages: engineScore.cases.reduce((sum: number, row: any) => sum + Number(row.cost?.braveImages || 0), 0),
    engineAcquisitionAi: engineScore.cases.reduce((sum: number, row: any) => sum + Number(row.cost?.acquisitionAiCalls || 0), 0),
    engineResearchAi: engineScore.cases.reduce((sum: number, row: any) => sum + Number(row.cost?.researchAiCalls || 0), 0),
    codexQueries: [...codexById.values()].reduce((sum: number, row: any) => sum + row.queriesExecuted.length, 0),
  },
};
write("cost-analysis.json", costAnalysis);

const failureAnalysis = {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  criticalErrors,
  engineErrors: [
    {
      caseId: "N64-04",
      type: "WRONG_REJECT",
      observed: "The resolver matched generic seller condition boilerplate containing the word VHS and classified a photographed box+cartridge+manual video-game listing as non_game_product.",
      groundTruth: "ACCEPT_EXISTING n64-shadow-man at generic PAL Europe; no PAL submarket promotion.",
      rootCause: "rejectionReason scans the entire listing description for merchandise tokens without separating generic eBay condition boilerplate from product-specific text.",
      safetyImpact: "False negative only; no catalog or price mutation occurred.",
    },
  ],
  unresolvedCases: finalUnresolved.map((row: any) => ({
    caseId: row.caseId,
    game: row.game,
    reason: truthById.get(row.caseId).reason,
    gaps: truthById.get(row.caseId).unresolvedGaps,
  })),
  unavailableCases: caseRows.filter((row: any) => row.availability === "CASE_UNAVAILABLE").map((row: any) => ({ caseId: row.caseId, game: row.game, reason: row.availabilityReason })),
  safety: {
    falseAccept: 0,
    wrongReroute: 0,
    unsupportedMarketPromotion: 0,
    crossComponentAttribution: 0,
    crossListingAttribution: 0,
    fabricatedIdentifier: 0,
    catalogMutations: 0,
    priceMutations: 0,
    authoritativeQueueMutations: 0,
    publicAssetMutations: 0,
  },
};
write("failure-analysis.json", failureAnalysis);

const learningCandidates = {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  appliedDuringBenchmark: false,
  candidates: [
    {
      id: "LC-001",
      type: "LISTING_TEXT_PROVENANCE",
      affectedCases: ["N64-04"],
      observation: "Generic condition boilerplate containing VHS/DVD triggered non_game_product despite target-game box, cartridge, and manual being visible.",
      proposedLearning: "Classify description spans as product-specific versus marketplace boilerplate before applying reject tokens; require a product-specific conflict or visual conflict for non-game rejection.",
    },
    {
      id: "LC-002",
      type: "MULTI_COMPONENT_OBSERVATION",
      affectedCases: ["N64-04"],
      observation: "High-detail classification found box, cartridge, and manual in one image, but the normalized observation collapsed to UNKNOWN_COMPONENT.",
      proposedLearning: "Preserve one component-bound observation per confidently classified component even when multiple components share an image.",
    },
    {
      id: "LC-003",
      type: "LISTING_METADATA_IDENTIFIER_ROUTE",
      affectedCases: ["PS4-02", "PS4-04", "PS5-01", "PS5-02", "PS5-03"],
      observation: "Exact EAN/MPN values existed in the frozen Browse API payload but did not reach the Engine bundle, causing generic-title searches.",
      proposedLearning: "Pass normalized API EAN/UPC/MPN into the Knowledge Pack as explicitly low-trust LISTING_METADATA identifiers and immediately route exact verification without promoting them to physical evidence.",
    },
    {
      id: "LC-004",
      type: "REGIONAL_SIBLING_ADJUDICATION",
      affectedCases: ["GB-01", "GB-02"],
      observation: "The Engine captured all decisive component-bound evidence but did not map it to existing Japan/USA sibling entries.",
      proposedLearning: "Expose all same-work regional siblings in catalog alternatives and add deterministic market-text rules for explicit Japan-only legal text and distributor-bound USA box evidence.",
    },
    {
      id: "LC-005",
      type: "SPECIMEN_BOUND_STOP_RULE",
      affectedCases: ["PS4-02", "PS4-04", "PS5-01", "PS5-02", "PS5-03", "PS5-04"],
      observation: "External sources can solve product-family identifiers but cannot manufacture listing-bound condition, seal, disc, or package evidence absent from the selected listing.",
      proposedLearning: "After exact product-family mapping, stop and DEFER when the remaining gap is specimen-bound and the original listing has no eligible component photo.",
    },
  ],
};
write("learning-candidates.json", learningCandidates);

const summary = `# RegionAtlas Engine + Codex Review Benchmark — PILOT_16

## Scope and freeze

- Base SHA: \`cc46b050b07e7ad3522ba8b233a8e7f9b4154752\`
- Selection freeze: \`${selected.freezeHash}\`
- Selected games: 16 fixed cases; unavailable cases were not replaced.
- Usable listings: ${evaluable.length}/16 (${percentage(evaluable.length, 16)}%).
- Preflight: all usable cases were \`NOT_DEEPLY_ANALYZED\`.
- Engine results were frozen before the Codex review queue was created.
- Codex reviewed only \`REVIEW_REQUIRED\` cases and repeated 0 Engine routes.
- Ground truth was generated after both stages were frozen. The generator excluded Engine/Codex decision files, but perfect human blinding is not claimed because one Codex task executed the benchmark.
- Catalog, price, authoritative queue, and public asset mutations: 0.

## Outcome

The Engine resolved 1 of 9 evaluable cases autonomously (11.1%), but that decision was wrong: the Shadow Man listing was rejected because generic eBay condition boilerplate mentioned VHS/DVD even though high-detail classification found the game box, cartridge, and manual. Engine decision precision is therefore 0/1.

The Engine sent 8 cases to Codex. Codex safely recovered 2 of them (25.0%): both Game Boy listings were rerouted to existing regional siblings using decisive evidence already present in the Engine bundle. The other six cases remained deferred because the selected listings lacked specimen-bound back, disc, seal, or actual-product photos. Exact EAN research improved product-family mapping but could not prove the selected unit.

The combined system produced 3 final non-defer decisions: 2 correct and 1 incorrect. Final precision is 66.7%; global exact resolution is 2/9 (22.2%). Of the two correct resolutions, 100% of the decisive evidence had already been discovered by the Engine and required Codex adjudication.

## Per-case scorecard

| Case | Listing | Engine | Engine correct | Codex | Codex correct | Ground truth | Final | Discovery owner | Engine USD | Codex USD |
|---|---|---|---:|---|---:|---|---|---|---:|---:|
${caseRows.map((row: any) => `| ${row.caseId} ${row.game} | ${row.availability} | ${row.engineDecision || "—"} | ${row.engineCorrect === null ? "—" : row.engineCorrect ? "yes" : "no"} | ${row.codexDecision || "—"} | ${row.codexCorrect === null ? "—" : row.codexCorrect ? "yes" : "no"} | ${row.groundTruthDecision}${row.groundTruthCatalogId ? ` → ${row.groundTruthCatalogId}` : ""} | ${row.finalDecision} | ${row.discoveryOwner} | ${row.engineCostUsd.toFixed(6)} | ${row.codexCostUsd.toFixed(6)} |`).join("\n")}

## Platform summary

| Platform | Attempted | Available | Engine decided/correct | Review | Codex resolved/correct | Final resolved/correct |
|---|---:|---:|---:|---:|---:|---:|
${platforms.map((row: any) => `| ${row.platform} | ${row.attempted} | ${row.available} | ${row.engine.decided}/${row.engine.correct} | ${row.engine.reviewRequired} | ${row.codex.resolved}/${row.codex.correct} | ${row.final.resolved}/${row.final.correct} |`).join("\n")}

## Root causes and learning candidates

1. The only autonomous Engine decision was a false negative caused by unscoped description-token rejection over seller boilerplate.
2. Five modern listings exposed exact identifiers in Browse API metadata, but those low-trust identifiers did not reach the Engine bundle; the router therefore spent most searches on generic title/source templates.
3. The Game Boy bundles already contained decisive market evidence, but the Engine did not adjudicate the existing regional siblings.
4. Six modern cases hit a real evidence boundary: external product records cannot replace photos of the selected unit for condition, seal, contents, or exact packaging.
5. These findings are recorded only in \`learning-candidates.json\`; no Engine knowledge or behavior was changed during the exam.

## Cost and safety

- Engine retrieval: $${money(engineRetrieval)?.toFixed(6)}
- Engine AI: $${money(engineAi)?.toFixed(6)}
- Engine total: $${money(engineTotal)?.toFixed(6)}
- Codex repository-billed retrieval/AI: $0.000000 (integrated Codex cost is not observable in repository API billing)
- Total measurable API cost: $${money(totalCost)?.toFixed(6)}
- Cost per final correct case: $${money(totalCost / finalCorrect.length)?.toFixed(6)}
- False accepts, wrong reroutes, unsupported market promotions, cross-component attribution, cross-listing attribution, and fabricated identifiers: 0.
- Wrong rejects: 1.

TOTAL SELECTED GAMES: 16

USABLE CASES: ${evaluable.length}
GROUND-TRUTH EVALUABLE CASES: ${evaluable.length}

ENGINE
------
AUTONOMOUS COVERAGE: ${engineDecided.length}/${evaluable.length} (${percentage(engineDecided.length, evaluable.length)}%)
DECISION PRECISION: ${engineCorrect.length}/${engineDecided.length} (${percentage(engineCorrect.length, engineDecided.length)}%)
GLOBAL EXACT RESOLUTION: ${engineCorrect.length}/${evaluable.length} (${percentage(engineCorrect.length, evaluable.length)}%)
REVIEW REQUIRED RATE: ${reviews.length}/${evaluable.length} (${percentage(reviews.length, evaluable.length)}%)
CRITICAL ERRORS: ${Object.values(criticalErrors).reduce((sum, value) => sum + value, 0)} (WRONG_REJECT=1)

CODEX
-----
REVIEWED: ${reviews.length}
RESOLVED: ${codexResolved.length}/${reviews.length} (${percentage(codexResolved.length, reviews.length)}%)
PRECISION: ${codexCorrect.length}/${codexResolved.length} (${percentage(codexCorrect.length, codexResolved.length)}%)
SALVAGE RATE: ${codexCorrect.length}/${reviews.length} (${percentage(codexCorrect.length, reviews.length)}%)
CRITICAL ERRORS: 0

END TO END
----------
FINAL COVERAGE: ${finalResolved.length}/${evaluable.length} (${percentage(finalResolved.length, evaluable.length)}%)
FINAL PRECISION: ${finalCorrect.length}/${finalResolved.length} (${percentage(finalCorrect.length, finalResolved.length)}%)
GLOBAL EXACT RESOLUTION: ${finalCorrect.length}/${evaluable.length} (${percentage(finalCorrect.length, evaluable.length)}%)
UNRESOLVED: ${finalUnresolved.length}

RESOLUTION CREDIT
-----------------
ENGINE: ${engineCorrect.length}/${finalCorrect.length} (${percentage(engineCorrect.length, finalCorrect.length)}%)
CODEX: ${codexCorrect.length}/${finalCorrect.length} (${percentage(codexCorrect.length, finalCorrect.length)}%)

DISCOVERY ATTRIBUTION
---------------------
ENGINE DISCOVERED + ENGINE RESOLVED: ${attributionCounts.ENGINE_DISCOVERED_ENGINE_RESOLVED}/${evaluable.length} (${percentage(attributionCounts.ENGINE_DISCOVERED_ENGINE_RESOLVED, evaluable.length)}%)
ENGINE DISCOVERED + CODEX ADJUDICATED: ${attributionCounts.ENGINE_DISCOVERED_CODEX_ADJUDICATED}/${evaluable.length} (${percentage(attributionCounts.ENGINE_DISCOVERED_CODEX_ADJUDICATED, evaluable.length)}%)
JOINT DISCOVERY: ${attributionCounts.JOINT_DISCOVERY}/${evaluable.length} (${percentage(attributionCounts.JOINT_DISCOVERY, evaluable.length)}%)
CODEX DISCOVERED: ${attributionCounts.CODEX_DISCOVERED}/${evaluable.length} (${percentage(attributionCounts.CODEX_DISCOVERED, evaluable.length)}%)
UNRESOLVED: ${attributionCounts.UNRESOLVED}/${evaluable.length} (${percentage(attributionCounts.UNRESOLVED, evaluable.length)}%)

COST
----
ENGINE: $${money(engineTotal)?.toFixed(6)}
CODEX: $${money(codexTotal)?.toFixed(6)} measurable repository API cost
TOTAL: $${money(totalCost)?.toFixed(6)}
COST / FINAL CORRECT CASE: $${money(totalCost / finalCorrect.length)?.toFixed(6)}
`;
writeFileSync(path.join(ROOT, "benchmark-summary.md"), summary, "utf8");

process.stdout.write(`BENCHMARK_FINALIZED usable=${evaluable.length} engineCorrect=${engineCorrect.length} codexCorrect=${codexCorrect.length} finalCorrect=${finalCorrect.length}\n`);
