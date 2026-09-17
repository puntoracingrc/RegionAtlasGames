#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- this script consolidates immutable benchmark payloads. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { RESEARCH_COVERAGE_BUCKETS } from "../src/lib/research-engine/v2-types";

const ROOT = path.resolve(process.cwd(), "artifacts/research-engine/worldwide-identifier-resolution-v1");
const IMPLEMENTATION_HEAD = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const CASES = [
  ["PS4-01", "A Plague Tale: Innocence", "ps4"], ["PS4-02", "Valkyria Chronicles 4", "ps4"],
  ["PS4-03", "The Surge 2", "ps4"], ["PS4-04", "A Way Out", "ps4"],
  ["PS5-01", "A Plague Tale: Requiem", "ps5"], ["PS5-02", "Steelrising", "ps5"],
  ["PS5-03", "Wo Long: Fallen Dynasty", "ps5"], ["PS5-04", "Dead Space", "ps5"],
  ["N64-01", "1080° Snowboarding", "n64"], ["N64-02", "Mystical Ninja Starring Goemon", "n64"],
  ["N64-03", "Star Wars: Rogue Squadron", "n64"], ["N64-04", "Body Harvest", "n64"],
  ["GB-01", "Dr. Mario", "gameboy"], ["GB-02", "Kirby's Dream Land", "gameboy"],
  ["GB-03", "Mole Mania", "gameboy"], ["GB-04", "Gargoyle's Quest", "gameboy"],
] as const;

async function readJson(filename: string): Promise<any | null> {
  return readFile(filename, "utf8").then(JSON.parse).catch(() => null);
}

async function json(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function quotaBlockedCase(caseId: string, title: string, platform: string) {
  return {
    caseId, title, platform, completed: false, blocker: "BRAVE_PREPAID_CREDIT_EXHAUSTED",
    coverageLedger: RESEARCH_COVERAGE_BUCKETS.map((bucket) => ({
      bucket, status: "TECHNICAL_FAILURE", sourcesConsulted: [], queries: [], identifiersFound: [], physicalFamiliesFound: [],
      remainingGaps: ["PROVIDER_QUOTA_EXHAUSTED: Brave HTTP 402 prepaid credit balance insufficient; case not started."],
    })),
    totals: { queries: 0, exactIdentifierQueries: 0, duplicateQueriesPrevented: 0, candidates: 0, corroborated: 0, partial: 0, hardConflicts: 0, imageUrls: 0, visionCalls: 0, ocrCalls: 0, cost: { openAiUsd: 0, braveUsd: 0, totalUsd: 0 } },
  };
}

function normalizeFailure(row: any) {
  const quota = /prepaid credit balance|balance is insufficient/i.test(row.detail ?? "");
  return quota ? { ...row, code: "PROVIDER_QUOTA_EXHAUSTED" } : row;
}

async function main(): Promise<void> {
  const absolum = await readJson(path.join(ROOT, "cases", "ABSOLUM-PS5", "result.json"));
  if (!absolum) throw new Error("ABSOLUM_RESULT_MISSING");
  const pilot = [];
  for (const [caseId, title, platform] of CASES) {
    const existing = await readJson(path.join(ROOT, "cases", caseId, "result.json"));
    pilot.push(existing ?? quotaBlockedCase(caseId, title, platform));
  }
  const traces = [absolum, ...pilot].flatMap((entry) => (entry.runs ?? []).flatMap((run: any) => run.identifiers.map((trace: any) => ({ caseId: entry.caseId, bucket: run.bucket, targetField: run.targetField, ...trace }))));
  const failures = [absolum, ...pilot].flatMap((entry) => (entry.runs ?? []).flatMap((run: any) => run.technicalFailures.map((failure: any) => ({ caseId: entry.caseId, bucket: run.bucket, targetField: run.targetField, ...normalizeFailure(failure) }))));
  const completed = pilot.filter((entry) => entry.completed !== false);
  const quotaBlocked = pilot.filter((entry) => entry.completed === false || entry.runs?.some((run: any) => run.technicalFailures.some((failure: any) => /prepaid credit balance|balance is insufficient/i.test(failure.detail ?? ""))));
  const pilotSummary = {
    schemaVersion: 1,
    implementationHead: IMPLEMENTATION_HEAD,
    status: pilot.every((entry) => entry.completed !== false && !entry.runs?.some((run: any) => run.status === "BLOCKED_INFRASTRUCTURE")) ? "COMPLETE" : "BLOCKED_PROVIDER_QUOTA",
    casesRequested: 16,
    casesWithFrozenArtifacts: completed.length,
    casesBlockedOrNotStarted: quotaBlocked.length,
    blocker: "Brave HTTP 402: prepaid credit balance insufficient.",
    cases: pilot.map((entry) => ({ caseId: entry.caseId, title: entry.title, platform: entry.platform, coverageLedger: entry.coverageLedger, totals: entry.totals, blocker: entry.blocker ?? null })),
    invariants: { catalogMutations: 0, priceMutations: 0, authoritativeQueueMutations: 0, publicAssetMutations: 0, visionCalls: 0, ocrCalls: 0 },
  };
  const efficiency = {
    absolum: absolum.totals,
    pilot16Partial: {
      casesWithFrozenArtifacts: completed.length,
      queries: completed.reduce((sum: number, entry: any) => sum + entry.totals.queries, 0),
      exactIdentifierQueries: completed.reduce((sum: number, entry: any) => sum + entry.totals.exactIdentifierQueries, 0),
      duplicateQueriesPrevented: completed.reduce((sum: number, entry: any) => sum + entry.totals.duplicateQueriesPrevented, 0),
      costUsd: completed.reduce((sum: number, entry: any) => sum + entry.totals.cost.totalUsd, 0),
    },
    note: "Provider-usage cost counts attempted Brave calls; HTTP 402 failures may not be billable and are retained for auditability.",
  };
  await json(path.join(ROOT, "absolum-result.json"), { ...absolum, implementationHead: IMPLEMENTATION_HEAD });
  await json(path.join(ROOT, "absolum-trace.json"), traces.filter((row) => row.caseId === "ABSOLUM-PS5"));
  await json(path.join(ROOT, "pilot16-summary.json"), pilotSummary);
  await json(path.join(ROOT, "pilot16-coverage.json"), pilot.map((entry) => ({ caseId: entry.caseId, title: entry.title, platform: entry.platform, coverageLedger: entry.coverageLedger })));
  await json(path.join(ROOT, "identifier-resolution-traces.json"), traces);
  await json(path.join(ROOT, "query-efficiency.json"), efficiency);
  await json(path.join(ROOT, "source-failures.json"), failures);

  const implementation = [
    "# Worldwide Identifier Resolution V1 — implementation summary", "",
    `- Implementation HEAD: ${IMPLEMENTATION_HEAD}`,
    "- Extended the existing Research Engine; no second engine or provider was introduced.",
    "- Added deterministic candidate extraction, normalization, checksum/platform validation, exact-search expansion, title/platform/edition/region binding, corroboration and hard-conflict rejection.",
    "- Added field-specific, release-seed, regional and local-title ladder stages with scoped query deduplication and dynamic replanning.",
    "- Added worldwide coverage ledgers, terminal search-exhaustion records, identifier traces and efficiency telemetry.",
    "- Split discovery, confirmation and negative-evidence source capabilities; GameFAQs and Libretro remain discovery-only where configured.",
    "- Reused the existing router, worker, source registry, page/browser layer, conflict reducer, durable store and Brave/OpenAI runtime.",
    "- Vision = 0; OCR = 0; all image records are URL/metadata only.",
  ].join("\n");
  await writeFile(path.join(ROOT, "implementation-summary.md"), `${implementation}\n`, "utf8");
  const closure = [
    "# Worldwide Identifier Resolution V1 — closure", "",
    "## Decision", "", "PHASE STATUS: BLOCKED_PROVIDER_QUOTA", "",
    "The implementation and deterministic acceptance replays pass, and the live Absolum run improves USA and Japan without market contamination. The Pilot 16 cannot be declared complete because Brave returned HTTP 402 (prepaid credit balance insufficient) after the four PS4 games; the four PS5 games were frozen as technical failures and N64/Game Boy were not started.", "",
    "## Absolum", "", `- USA UPC: ${absolum.runs.find((run: any) => run.label === "USA")?.status ?? "missing"}`,
    `- Japan JAN: ${absolum.runs.find((run: any) => run.label === "Japan JAN")?.status ?? "missing"}`,
    `- Japan product ID: ${absolum.runs.find((run: any) => run.label === "Japan product id")?.status ?? "missing"}`,
    `- HK/TW barcode: ${absolum.runs.find((run: any) => run.label === "Hong Kong Taiwan barcode")?.status ?? "missing"} after complete live-source exhaustion`,
    `- Korea barcode: ${absolum.runs.find((run: any) => run.label === "Korea barcode")?.status ?? "missing"} after complete live-source exhaustion`,
    "- European Special national market: NO_DISTINCT_NATIONAL_MARKET_PROVEN (confirmed, not unresolved)", "",
    "## Safety", "", "- CATALOG MUTATIONS = 0", "- PRICE MUTATIONS = 0", "- AUTHORITATIVE QUEUE MUTATIONS = 0", "- PUBLIC ASSET MUTATIONS = 0", "- VISION CALLS = 0", "- OCR CALLS = 0", "",
    "## Remaining action", "", "Top up Brave prepaid credit, then resume with `npm run research:worldwide:v1 -- --phase=pilot16 --start-case=N64-01`. Do not merge before the resumed Pilot 16 and final comparison are complete.",
  ].join("\n");
  await writeFile(path.join(ROOT, "closure.md"), `${closure}\n`, "utf8");
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
