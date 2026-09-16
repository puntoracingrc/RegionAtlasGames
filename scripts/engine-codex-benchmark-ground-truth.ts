#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- reads frozen benchmark evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { curatorHash } from "../src/lib/review-curator";

const ROOT = path.resolve(process.cwd(), process.argv[2] || "artifacts/engine-codex-review-benchmark");
const selected = JSON.parse(readFileSync(path.join(ROOT, "selected-listings.json"), "utf8")) as {
  freezeHash: string;
  cases: Array<Record<string, any>>;
};

type Verdict = {
  decision: "ACCEPT_EXISTING" | "REROUTE_EXISTING" | "REJECT" | "PROPOSE_NEW_VARIANT" | "DEFER" | "CASE_UNAVAILABLE";
  resolvedCatalogId: string | null;
  confidence: number;
  exactFacts: string[];
  decisiveEvidence: Array<{ source: string; claim: string; component: string | null; listingId: string | null; imageIndex: number | null }>;
  unresolvedGaps: string[];
  reason: string;
};

const unavailable = (reason: string): Verdict => ({
  decision: "CASE_UNAVAILABLE",
  resolvedCatalogId: null,
  confidence: 1,
  exactFacts: [],
  decisiveEvidence: [],
  unresolvedGaps: [reason],
  reason: "No eligible active fixed-price physical listing was available at the selection freeze; the case is excluded from decision precision.",
});

const listingGap = (facts: string[], gaps: string[], reason: string): Verdict => ({
  decision: "DEFER",
  resolvedCatalogId: null,
  confidence: 1,
  exactFacts: facts,
  decisiveEvidence: [],
  unresolvedGaps: gaps,
  reason,
});

const verdicts: Record<string, Verdict> = {
  "PS4-01": unavailable("NO_ACTIVE_PHYSICAL_LISTING"),
  "PS4-02": listingGap(
    ["Soul Hackers 2 PS4 identity is visible", "EAN 5055277046874 is listing metadata, not a visible component identifier"],
    ["NO_LISTING_BOUND_BACK_PHOTO", "NO_DISC_PHOTO", "NO_VISIBLE_SEAL", "NO_MARKET_LEGAL_TEXT"],
    "The selected listing does not physically bind market, exact package variant, or new/sealed condition. A correct product-family EAN does not replace specimen evidence.",
  ),
  "PS4-03": unavailable("NO_ACTIVE_PHYSICAL_LISTING"),
  "PS4-04": listingGap(
    ["Code Vein PS4 identity is visible", "EAN 3391891995962 is seller metadata", "The seller labels its image non-contractual"],
    ["NO_ACTUAL_LISTING_SPECIMEN_PHOTO", "NO_DISC_PHOTO", "NO_VISIBLE_CONDITION_PROOF"],
    "The product family can be researched, but the selected unit cannot be accepted or rerouted safely from a non-contractual image.",
  ),
  "PS5-01": listingGap(
    ["Demon's Souls PS5 identity is visible", "EAN 0711719812920 is listing metadata"],
    ["NO_LISTING_BOUND_BACK_PHOTO", "NO_DISC_PHOTO", "NO_VISIBLE_SEAL", "EXACT_MARKET_SET_UNBOUND"],
    "Only the front is visible. The title's Spanish/sealed claims and seller location cannot certify the specimen's market set or seal.",
  ),
  "PS5-02": listingGap(
    ["Dragon's Dogma 2 PS5 identity is visible", "EAN 5055060954133 and MPN 1245784 are listing metadata"],
    ["NO_LISTING_BOUND_BACK_PHOTO", "NO_DISC_PHOTO", "NO_VISIBLE_SEAL", "EXACT_MARKET_SET_UNBOUND"],
    "Only the front is visible. The selected unit cannot be bound to a national or shared-European package, and the claimed factory seal is not visible.",
  ),
  "PS5-03": listingGap(
    ["Final Fantasy XVI PS5 standard identity is visible", "EAN 5021290096851 is listing metadata", "Seller explicitly says the image is illustrative"],
    ["NO_ACTUAL_LISTING_SPECIMEN_PHOTO", "NO_DISC_PHOTO", "NO_VISIBLE_CONDITION_PROOF"],
    "The exact used item is not pictured, so neither its package variant nor its condition can be certified.",
  ),
  "PS5-04": listingGap(
    ["Hogwarts Legacy standard PS5 front identity is visible"],
    ["NO_EXACT_IDENTIFIER", "NO_LISTING_BOUND_BACK_PHOTO", "NO_DISC_PHOTO", "NO_VISIBLE_SEAL", "NO_MARKET_LEGAL_TEXT"],
    "No exact EAN/PPSA is exposed and only the front is visible; seller claims alone do not bind market or condition.",
  ),
  "N64-01": unavailable("NO_USABLE_LISTING"),
  "N64-02": unavailable("NO_ACTIVE_PHYSICAL_LISTING"),
  "N64-03": unavailable("NO_ACTIVE_PHYSICAL_LISTING"),
  "N64-04": {
    decision: "ACCEPT_EXISTING",
    resolvedCatalogId: "n64-shadow-man",
    confidence: 0.98,
    exactFacts: ["The single listing photo visibly contains the PAL-version box front, cartridge, and instruction booklet", "The catalog candidate is the generic PAL Europe Shadow Man entry"],
    decisiveEvidence: [
      { source: "engine-acquisition/cases/N64-04/classifications.json", claim: "The photo contains OUTER_PACKAGE_FRONT, CARTRIDGE_FRONT, and MANUAL_FRONT for Shadow Man.", component: "MULTI_COMPONENT", listingId: "v1|326822603505|0", imageIndex: 1 },
      { source: "engine-acquisition/cases/N64-04/observations.json", claim: "Visible text includes SHADOW MAN, NINTENDO 64, PAL VERSION, and Instruction Booklet.", component: "MULTI_COMPONENT", listingId: "v1|326822603505|0", imageIndex: 1 },
    ],
    unresolvedGaps: ["PAL_SUBMARKET_NOT_PROVEN"],
    reason: "The listing is a complete PAL Shadow Man specimen and safely matches the existing generic PAL Europe entry. It must not be promoted to Spain or another PAL submarket.",
  },
  "GB-01": {
    decision: "REROUTE_EXISTING",
    resolvedCatalogId: "gameboy-japon-lock-n-chase",
    confidence: 0.99,
    exactFacts: ["Box, cartridge, and manual are visible", "DMG-LCA appears on the physical family", "The manual states FOR SALE AND USE IN JAPAN ONLY"],
    decisiveEvidence: [
      { source: "engine-acquisition/cases/GB-01/observations.json", claim: "The component set includes box, cartridge, and manual with DMG-LCA; manual back explicitly limits sale/use to Japan.", component: "BOX+CARTRIDGE+MANUAL", listingId: "v1|377464390784|0", imageIndex: 7 },
    ],
    unresolvedGaps: [],
    reason: "The selected specimen is the Japanese regional sibling and must be rerouted from the PAL candidate to the existing Japanese catalog entry.",
  },
  "GB-02": {
    decision: "REROUTE_EXISTING",
    resolvedCatalogId: "gameboy-nail-n-scale",
    confidence: 0.99,
    exactFacts: ["Box, cartridge, and manual are visible", "UPC 013252002548 is visible on the box back", "The box names DATA EAST USA, INC."],
    decisiveEvidence: [
      { source: "engine-acquisition/cases/GB-02/observations.json", claim: "The outer-package back visibly binds UPC 013252002548 and DATA EAST USA, INC. to this specimen.", component: "OUTER_PACKAGE_BACK", listingId: "v1|157686535662|0", imageIndex: 2 },
    ],
    unresolvedGaps: [],
    reason: "The selected specimen is the USA regional sibling and must be rerouted from the PAL candidate to the existing USA catalog entry. The uncertain OCR string DMG-P-DR is not used.",
  },
  "GB-03": unavailable("NO_ACTIVE_PHYSICAL_LISTING"),
  "GB-04": unavailable("NO_ACTIVE_PHYSICAL_LISTING"),
};

for (const entry of selected.cases) {
  if (!existsSync(path.join(ROOT, "cases", entry.caseId, "codex-result.json")) && entry.status === "SELECTED" && entry.caseId !== "N64-04") {
    throw new Error(`CODEX_NOT_FROZEN ${entry.caseId}`);
  }
  if (!verdicts[entry.caseId]) throw new Error(`MISSING_GROUND_TRUTH ${entry.caseId}`);
}

const cases = selected.cases.map((entry) => {
  const verdict = verdicts[entry.caseId];
  const result: Record<string, unknown> = {
    caseId: entry.caseId,
    game: entry.game,
    platform: entry.platform,
    listingId: entry.listingId,
    availability: entry.status === "SELECTED" ? "USABLE" : "CASE_UNAVAILABLE",
    groundTruthDecision: verdict.decision,
    resolvedCatalogId: verdict.resolvedCatalogId,
    confidence: verdict.confidence,
    exactFacts: verdict.exactFacts,
    decisiveEvidence: verdict.decisiveEvidence,
    unresolvedGaps: verdict.unresolvedGaps,
    reason: verdict.reason,
  };
  result.groundTruthHash = curatorHash(result);
  return result;
});

const document = {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  selectionFreezeHash: selected.freezeHash,
  auditOrder: "AFTER_ENGINE_AND_CODEX_FREEZE",
  evaluatorIsolation: {
    decisionFilesReadByGenerator: false,
    evidenceInputs: ["selected-listings.json", "engine-acquisition case evidence", "catalog entries"],
    blinding: "PROCEDURAL_ONLY_SAME_AGENT",
    limitation: "The generator does not read Engine or Codex decisions, but the benchmark was executed by one Codex task, so human-level perfect blinding is not claimed.",
  },
  evaluableCases: cases.filter((row) => row.availability === "USABLE").length,
  unavailableCases: cases.filter((row) => row.availability === "CASE_UNAVAILABLE").length,
  cases,
  frozenAt: new Date().toISOString(),
};

mkdirSync(ROOT, { recursive: true });
writeFileSync(path.join(ROOT, "ground-truth.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
process.stdout.write(`GROUND_TRUTH_FROZEN ${curatorHash(document)}\n`);
