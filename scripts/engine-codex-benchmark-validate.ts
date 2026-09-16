#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- validates committed benchmark JSON. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), process.argv[2] || "artifacts/engine-codex-review-benchmark");
const REQUIRED = [
  "benchmark-summary.md",
  "selected-listings.json",
  "engine-scorecard.json",
  "codex-review-scorecard.json",
  "end-to-end-scorecard.json",
  "discovery-attribution.json",
  "per-case-ledger.json",
  "ground-truth.json",
  "learning-candidates.json",
  "cost-analysis.json",
  "failure-analysis.json",
];
const FIXED_IDS = ["PS4-01", "PS4-02", "PS4-03", "PS4-04", "PS5-01", "PS5-02", "PS5-03", "PS5-04", "N64-01", "N64-02", "N64-03", "N64-04", "GB-01", "GB-02", "GB-03", "GB-04"];

function fail(message: string): never {
  throw new Error(`BENCHMARK_VALIDATION_FAILED ${message}`);
}

function readJson(name: string): any {
  return JSON.parse(readFileSync(path.join(ROOT, name), "utf8"));
}

for (const file of REQUIRED) if (!existsSync(path.join(ROOT, file))) fail(`missing ${file}`);

const selected = readJson("selected-listings.json");
const engineScore = readJson("engine-scorecard.json");
const codexScore = readJson("codex-review-scorecard.json");
const truth = readJson("ground-truth.json");
const final = readJson("end-to-end-scorecard.json");
const attribution = readJson("discovery-attribution.json");
const failures = readJson("failure-analysis.json");

if (selected.cases.length !== 16) fail("selection is not 16 cases");
if (JSON.stringify(selected.cases.map((row: any) => row.caseId)) !== JSON.stringify(FIXED_IDS)) fail("fixed case order changed");
if (!/^[a-f0-9]{64}$/.test(selected.freezeHash)) fail("invalid selection freeze hash");
const usable = selected.cases.filter((row: any) => row.status === "SELECTED");
if (usable.length !== 9) fail("unexpected usable count");
for (const row of usable) {
  if (!row.hydrated?.buyingOptions?.includes("FIXED_PRICE")) fail(`${row.caseId} is not fixed price`);
  if (!row.listingId || !row.inputHash || !row.galleryHash) fail(`${row.caseId} missing frozen selection fields`);
}

if (engineScore.usableCases !== 9 || engineScore.engineDecided !== 1 || engineScore.reviewRequired !== 8) fail("unexpected Engine scorecard counts");
if (codexScore.reviewed !== 8 || codexScore.resolved !== 2 || codexScore.repeatedEngineRoutes !== 0) fail("unexpected Codex scorecard counts");
if (truth.evaluableCases !== 9 || truth.unavailableCases !== 7) fail("unexpected ground-truth counts");

const codexCases = new Set(codexScore.cases.map((row: any) => row.caseId));
for (const row of engineScore.cases.filter((entry: any) => entry.availability !== "CASE_UNAVAILABLE")) {
  const engine = readJson(`cases/${row.caseId}/engine-result.json`);
  if (!engine.engineResultImmutable || engine.engineResultHash !== row.engineResultHash) fail(`${row.caseId} Engine freeze mismatch`);
  const shouldReview = engine.engineDecision === "REVIEW_REQUIRED";
  if (codexCases.has(row.caseId) !== shouldReview) fail(`${row.caseId} Codex queue isolation mismatch`);
  for (const evidence of engine.evidenceUsed) {
    if (evidence.origin !== "ENGINE" || typeof evidence.decisive !== "boolean") fail(`${row.caseId} invalid Engine ledger evidence`);
  }
  if (shouldReview) {
    const codex = readJson(`cases/${row.caseId}/codex-result.json`);
    if (!codex.codexResultImmutable || codex.reviewedEngineResultHash !== engine.engineResultHash) fail(`${row.caseId} Codex freeze mismatch`);
    if (Date.parse(codex.frozenAt) < Date.parse(engine.frozenAt)) fail(`${row.caseId} Codex predates Engine freeze`);
    for (const evidence of codex.evidenceUsed) {
      if (!['ENGINE', 'CODEX'].includes(evidence.origin) || typeof evidence.decisive !== "boolean") fail(`${row.caseId} invalid Codex ledger evidence`);
    }
    if (codex.repeatedEngineRoutes.length !== 0) fail(`${row.caseId} repeated Engine route`);
  }
}

if (truth.evaluatorIsolation.decisionFilesReadByGenerator !== false) fail("ground-truth generator read decision files");
if (final.engine.decisionPrecision.numerator !== 0 || final.engine.decisionPrecision.denominator !== 1) fail("Engine precision mismatch");
if (final.codex.precision.numerator !== 2 || final.codex.precision.denominator !== 2) fail("Codex precision mismatch");
if (final.final.globalExactResolution.numerator !== 2 || final.final.globalExactResolution.denominator !== 9) fail("final exact-resolution mismatch");
if (final.mutations.catalog !== 0 || final.mutations.prices !== 0 || final.mutations.authoritativeQueue !== 0 || final.mutations.publicAssets !== 0) fail("mutation boundary violated");
if (failures.criticalErrors.WRONG_REJECT !== 1) fail("wrong-reject root cause missing");
if (Object.values(failures.safety).some((value) => value !== 0)) fail("safety/mutation counter is non-zero");
if (attribution.categories.ENGINE_DISCOVERED_CODEX_ADJUDICATED.count !== 2 || attribution.categories.UNRESOLVED.count !== 7) fail("discovery attribution mismatch");

const summary = readFileSync(path.join(ROOT, "benchmark-summary.md"), "utf8");
if (!summary.endsWith("COST / FINAL CORRECT CASE: $0.242140\n")) fail("summary does not end with required closure block");

process.stdout.write("BENCHMARK_VALIDATION_PASS selected=16 usable=9 engineDecided=1 codexReviewed=8 finalCorrect=2 mutations=0\n");
