#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- benchmark artifacts intentionally preserve complete engine payloads. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import { getResearchSubjectById } from "../src/lib/research-engine/catalog-context";
import { compareResearchCatalogBoundary, hashResearchCatalogBoundary } from "../src/lib/research-engine/catalog-immutability";
import { scanResearchCatalog } from "../src/lib/research-engine/catalog-scanner";
import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { worldwideAcceptanceAllowed } from "../src/lib/research-engine/identifier-resolution";
import { createResearchWorkerDependencies } from "../src/lib/research-engine/runtime";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";
import type { ResearchSubject } from "../src/lib/research-engine/types";
import {
  RESEARCH_COVERAGE_BUCKETS,
  type DurableResearchTask,
  type ResearchCoverageBucket,
  type ResearchCoverageLedgerEntry,
  type ResearchTargetField,
} from "../src/lib/research-engine/v2-types";
import { runResearchTaskV2, type ResearchWorkerResult } from "../src/lib/research-engine/worker";

const ROOT = path.resolve(process.cwd(), "artifacts/research-engine/worldwide-identifier-resolution-v1");
const PHASE = process.argv.find((value) => value.startsWith("--phase="))?.split("=")[1] ?? "all";
const START_CASE = process.argv.find((value) => value.startsWith("--start-case="))?.split("=")[1] ?? null;
const GIT_SHA = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const BRAVE_REQUEST_USD = 0.005;

const PILOT_16 = [
  { id: "PS4-01", platform: "ps4", title: "A Plague Tale: Innocence" },
  { id: "PS4-02", platform: "ps4", title: "Valkyria Chronicles 4" },
  { id: "PS4-03", platform: "ps4", title: "The Surge 2" },
  { id: "PS4-04", platform: "ps4", title: "A Way Out" },
  { id: "PS5-01", platform: "ps5", title: "A Plague Tale: Requiem" },
  { id: "PS5-02", platform: "ps5", title: "Steelrising" },
  { id: "PS5-03", platform: "ps5", title: "Wo Long: Fallen Dynasty" },
  { id: "PS5-04", platform: "ps5", title: "Dead Space" },
  { id: "N64-01", platform: "n64", title: "1080° Snowboarding" },
  { id: "N64-02", platform: "n64", title: "Mystical Ninja Starring Goemon" },
  { id: "N64-03", platform: "n64", title: "Star Wars: Rogue Squadron" },
  { id: "N64-04", platform: "n64", title: "Body Harvest" },
  { id: "GB-01", platform: "gameboy", title: "Dr. Mario" },
  { id: "GB-02", platform: "gameboy", title: "Kirby's Dream Land" },
  { id: "GB-03", platform: "gameboy", title: "Mole Mania" },
  { id: "GB-04", platform: "gameboy", title: "Gargoyle's Quest" },
] as const;

type FrozenRun = {
  label: string;
  bucket: ResearchCoverageBucket;
  submarket: string;
  targetField: ResearchTargetField;
  subject: ResearchSubject;
  result: ResearchWorkerResult | null;
  error: string | null;
};

function titleKey(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\[[^\]]+\]\s*$/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function json(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function subjectsFor(title: string, platform: string): ResearchSubject[] {
  const targeted = scanResearchCatalog({ platformSlug: platform, query: title, limit: null, includeClean: true });
  const direct = targeted.items.map((item) => item.subject).filter((subject) => titleKey(subject.title) === titleKey(title));
  if (direct.length) return direct;
  const platformScan = scanResearchCatalog({ platformSlug: platform, limit: null, includeClean: true });
  const scanned = platformScan.items.map((item) => item.subject).filter((subject) => titleKey(subject.title) === titleKey(title));
  if (scanned.length) return scanned;
  const requestedTokens = titleKey(title).split(" ").filter(Boolean);
  return catalogData
    .filter((game) => game.platformSlug === platform && game.listingStatus !== "excluded")
    .filter((game) => requestedTokens.every((token) => titleKey(game.title).split(" ").includes(token)))
    .sort((left, right) => left.title.length - right.title.length)
    .flatMap((game) => {
      const subject = getResearchSubjectById(`catalog:${game.id}`);
      return subject ? [subject] : [];
    });
}

function representativeSubject(title: string, platform: string): ResearchSubject {
  const subjects = subjectsFor(title, platform);
  const preferred = subjects.find((subject) => subject.kind === "physical-edition") ?? subjects.find((subject) => subject.kind === "catalog-entry") ?? subjects[0];
  if (!preferred) throw new Error(`NO_RESEARCH_SUBJECT:${platform}:${title}`);
  return preferred;
}

function neutralWorldwideSubject(title: string, platform: string): ResearchSubject {
  const source = representativeSubject(title, platform);
  return {
    ...source,
    id: `worldwide:${platform}:${titleKey(title)}`,
    kind: "related-release",
    physicalEditionId: null,
    edition: "Standard",
    region: "WORLDWIDE",
    barcode: null,
    productCodes: [],
    serials: [],
    marketRegions: [],
    evidenceMarkets: [],
    packagingLanguages: [],
    notes: [],
  };
}

function editionSubject(id: string): ResearchSubject {
  const subject = subjectsFor("Absolum", "ps5").find((candidate) => candidate.physicalEditionId === id);
  if (!subject) throw new Error(`ABSOLUM_SUBJECT_NOT_FOUND:${id}`);
  return subject;
}

function taskFor(input: { subject: ResearchSubject; field: ResearchTargetField; bucket: ResearchCoverageBucket; label: string }): DurableResearchTask {
  const timestamp = new Date().toISOString();
  return {
    id: `${input.subject.id}:worldwide-v1:${input.bucket.toLowerCase()}:${input.field.toLowerCase()}:${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    subjectId: input.subject.id,
    targetField: input.field,
    question: `Resolve ${input.field} for ${input.subject.title} ${input.subject.platformSlug} in ${input.label}; exact-search every candidate and stop only after search exhaustion.`,
    priority: "P1",
    evidenceNeeded: ["STRUCTURED_RELEASE_LEAD", "INDEPENDENT_EXACT_IDENTIFIER_CORROBORATION"],
    riskCodes: [],
    researchMode: "WORLDWIDE_VARIANT_DISCOVERY",
    coverageBucket: input.bucket,
    regionalTitleCandidates: [],
    status: "PENDING",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function taskDescriptor(subject: ResearchSubject, field: ResearchTargetField, bucket: ResearchCoverageBucket, label: string) {
  return { subject, field, bucket, label };
}

function absolumTasks() {
  const generic = neutralWorldwideSubject("Absolum", "ps5");
  const usa = editionSubject("absolum-ps5-north-america-standard");
  const japan = editionSubject("absolum-ps5-asia-japan");
  const korea = editionSubject("absolum-ps5-asia-korea");
  const hkTw = editionSubject("absolum-ps5-asia-hk-tw");
  const euStandard = editionSubject("absolum-ps5-europe-standard-en-fr-es");
  const euSpecial = editionSubject("absolum-ps5-europe-special");
  return [
    taskDescriptor(euStandard, "BARCODE", "EUROPE", "Europe standard"),
    taskDescriptor(euSpecial, "BARCODE", "EUROPE", "Europe special"),
    taskDescriptor(euSpecial, "MARKET_REGION", "EUROPE", "Europe special national market"),
    taskDescriptor(usa, "BARCODE", "NORTH_AMERICA", "USA"),
    taskDescriptor(japan, "BARCODE", "JAPAN", "Japan JAN"),
    taskDescriptor(japan, "PRODUCT_CODE", "JAPAN", "Japan product id"),
    taskDescriptor(hkTw, "BARCODE", "ASIA_OTHER", "Hong Kong Taiwan barcode"),
    taskDescriptor(hkTw, "PRODUCT_CODE", "ASIA_OTHER", "Hong Kong Taiwan product id"),
    taskDescriptor(korea, "BARCODE", "ASIA_OTHER", "Korea barcode"),
    taskDescriptor(generic, "BARCODE", "OCEANIA", "Oceania"),
    taskDescriptor(generic, "BARCODE", "LATIN_AMERICA", "Latin America"),
  ];
}

function pilotTasks(title: string, platform: string) {
  const subject = neutralWorldwideSubject(title, platform);
  const field: ResearchTargetField = ["n64", "gameboy"].includes(platform) ? "PRODUCT_CODE" : "BARCODE";
  return RESEARCH_COVERAGE_BUCKETS.map((bucket) => taskDescriptor(subject, field, bucket, bucket));
}

function resultCost(result: ResearchWorkerResult | null) {
  const openAiUsd = result?.state.usage.estimatedCostUsd ?? 0;
  const braveCalls = Number(result?.providerUsage["brave-search"] ?? 0) + Number(result?.providerUsage["brave-images"] ?? 0);
  return { openAiUsd: money(openAiUsd), braveUsd: money(braveCalls * BRAVE_REQUEST_USD), totalUsd: money(openAiUsd + braveCalls * BRAVE_REQUEST_USD) };
}

function frozenResult(run: FrozenRun) {
  const result = run.result;
  const imageUrls = result?.pages.flatMap((page) => page.imageCandidates.map((candidate) => ({
    source: page.canonicalUrl,
    pageUrl: candidate.sourcePageUrl || page.canonicalUrl,
    imageUrl: candidate.originalUrl || candidate.resolvedUrl || candidate.url,
    listingId: candidate.listingId || null,
    metadata: { alt: candidate.alt || null, caption: candidate.caption || null, galleryLabel: candidate.galleryLabel || null },
    status: "IMAGE_URL_FOUND",
  }))) ?? [];
  return {
    label: run.label,
    submarket: run.submarket,
    bucket: run.bucket,
    targetField: run.targetField,
    subject: run.subject,
    status: result?.state.status ?? "FAILED",
    resolution: result?.resolution ?? null,
    identifiers: result?.state.identifierTraces ?? [],
    queries: result?.state.queriesAttempted ?? [],
    sourcesReached: unique(result?.state.evidence.map((row) => row.sourceId) ?? []),
    directUrls: unique(result?.state.urlsVisited ?? []),
    searchExhaustion: result?.state.searchExhaustion ?? null,
    evidenceGaps: result?.state.evidenceGaps ?? [],
    conflicts: result?.state.conflicts ?? [],
    telemetry: result?.state.telemetry ?? null,
    technicalFailures: result?.technicalFailures ?? [],
    imageUrls: [...new Map(imageUrls.map((row) => [`${row.pageUrl}\0${row.imageUrl}`, row])).values()],
    visionCalls: result?.visionResults.length ?? 0,
    ocrCalls: 0,
    cost: resultCost(result),
    artifactDirectory: result?.artifactDirectory ?? null,
    error: run.error,
  };
}

function combinedLedger(rows: ReturnType<typeof frozenResult>[]): ResearchCoverageLedgerEntry[] {
  return RESEARCH_COVERAGE_BUCKETS.map((bucket) => {
    const runs = rows.filter((row) => row.bucket === bucket);
    const found = runs.some((row) => row.status === "CONFIRMED" && row.resolution?.value !== null);
    const technicalFailure = runs.some((row) => row.status === "BLOCKED_INFRASTRUCTURE" || row.searchExhaustion?.exhaustionStatus === "BLOCKED_BY_TECHNICAL_FAILURE");
    const exhausted = runs.length > 0 && runs.every((row) => row.status === "CONFIRMED" || row.searchExhaustion?.exhaustionStatus === "COMPLETE");
    const noCandidates = runs.every((row) => !row.identifiers.some((trace: any) => trace.validation === "VALID" && trace.finalStatus !== "REJECTED"));
    return {
      bucket,
      status: found ? "CONFIRMED_VARIANT_FOUND" : technicalFailure ? "TECHNICAL_FAILURE" : exhausted && noCandidates ? "NO_DISTINCT_VARIANT_FOUND" : "UNRESOLVED",
      sourcesConsulted: unique(runs.flatMap((row) => row.sourcesReached)),
      queries: runs.flatMap((row) => row.queries),
      identifiersFound: unique(runs.flatMap((row) => row.identifiers.filter((trace: any) => trace.validation === "VALID").map((trace: any) => trace.normalizedValue))),
      physicalFamiliesFound: unique(runs.filter((row) => row.status === "CONFIRMED").map((row) => row.subject.physicalEditionId || row.subject.edition)),
      remainingGaps: unique(runs.filter((row) => row.status !== "CONFIRMED").flatMap((row) => [row.resolution?.reason, ...(row.searchExhaustion?.missingStages ?? [])]).filter(Boolean) as string[]),
    };
  });
}

async function executeCase(input: { caseId: string; title: string; platform: string; descriptors: ReturnType<typeof taskDescriptor>[]; store: ResearchRunStore }) {
  const frozen: ReturnType<typeof frozenResult>[] = [];
  for (const [index, descriptor] of input.descriptors.entries()) {
    const task = taskFor(descriptor);
    const runId = `${input.caseId.toLowerCase()}-${String(index + 1).padStart(2, "0")}-${descriptor.bucket.toLowerCase()}-${descriptor.field.toLowerCase()}`;
    process.stdout.write(`WORLDWIDE_TASK_START ${runId} ${descriptor.label}\n`);
    let result: ResearchWorkerResult | null = null;
    let error: string | null = null;
    try {
      const dependencies = createResearchWorkerDependencies(input.store);
      dependencies.visionProvider = null;
      result = await runResearchTaskV2({ task, subject: descriptor.subject, dependencies, rootDir: process.cwd(), runId });
      if (result.visionResults.length || result.state.usage.images || Number(result.providerUsage["brave-images"] ?? 0)) throw new Error(`NO_VISION_POLICY_BREACH:${runId}`);
    } catch (cause) {
      error = cause instanceof Error ? cause.stack || cause.message : String(cause);
    }
    const row = frozenResult({ label: descriptor.label, submarket: descriptor.label, bucket: descriptor.bucket, targetField: descriptor.field, subject: descriptor.subject, result, error });
    frozen.push(row);
    await json(path.join(ROOT, "runs", input.caseId, runId, "frozen-result.json"), row);
    process.stdout.write(`WORLDWIDE_TASK_END ${runId} ${row.status} $${row.cost.totalUsd.toFixed(6)}\n`);
  }
  const coverageLedger = combinedLedger(frozen);
  const totals = {
    queries: frozen.reduce((sum, row) => sum + row.queries.length, 0),
    exactIdentifierQueries: frozen.reduce((sum, row) => sum + Number(row.telemetry?.exactIdentifierQueries ?? 0), 0),
    duplicateQueriesPrevented: frozen.reduce((sum, row) => sum + Number(row.telemetry?.duplicateQueriesPrevented ?? 0), 0),
    candidates: frozen.reduce((sum, row) => sum + Number(row.telemetry?.identifierCandidatesFound ?? 0), 0),
    corroborated: frozen.reduce((sum, row) => sum + Number(row.telemetry?.identifierCorroborated ?? 0), 0),
    partial: frozen.reduce((sum, row) => sum + Number(row.telemetry?.identifierPartial ?? 0), 0),
    hardConflicts: frozen.reduce((sum, row) => sum + Number(row.telemetry?.identifierSubjectConflicts ?? 0), 0),
    imageUrls: unique(frozen.flatMap((row) => row.imageUrls.map((image: any) => image.imageUrl))).length,
    visionCalls: 0,
    ocrCalls: 0,
    cost: {
      openAiUsd: money(frozen.reduce((sum, row) => sum + row.cost.openAiUsd, 0)),
      braveUsd: money(frozen.reduce((sum, row) => sum + row.cost.braveUsd, 0)),
      totalUsd: money(frozen.reduce((sum, row) => sum + row.cost.totalUsd, 0)),
    },
  };
  const result = {
    schemaVersion: 1,
    caseId: input.caseId,
    title: input.title,
    platform: input.platform,
    gitSha: GIT_SHA,
    researchMode: "WORLDWIDE_VARIANT_DISCOVERY",
    imagePolicy: "IMAGE_URL_FOUND_ONLY_NO_VISION_NO_OCR",
    runs: frozen,
    coverageLedger,
    worldwideTerminal: worldwideAcceptanceAllowed(coverageLedger),
    totals,
    resultHash: "",
  };
  result.resultHash = hash(result);
  await json(path.join(ROOT, "cases", input.caseId, "result.json"), result);
  return result;
}

async function absolumComparison(after: Awaited<ReturnType<typeof executeCase>>) {
  const baselinePath = path.resolve(process.cwd(), "../regionatlas-engine-codex-review-benchmark/artifacts/research-engine/absolum-ps5-no-vision/result.json");
  const baseline = await readFile(baselinePath, "utf8").then(JSON.parse).catch(() => null);
  const fields = [
    ["USA UPC", "USA", "BARCODE"],
    ["Japan JAN", "Japan JAN", "BARCODE"],
    ["Japan product ID", "Japan product id", "PRODUCT_CODE"],
    ["Asia barcode", "Hong Kong Taiwan barcode", "BARCODE"],
    ["Asia product ID", "Hong Kong Taiwan product id", "PRODUCT_CODE"],
    ["Korea barcode", "Korea barcode", "BARCODE"],
    ["Special national market", "Europe special national market", "MARKET_REGION"],
  ];
  const rows = fields.map(([field, label]) => {
    const run = after.runs.find((candidate) => candidate.label === label);
    return {
      field,
      before: baseline?.tasks?.find((task: any) => task.label === label)?.status ?? (field === "Special national market" ? "UNRESOLVED" : "UNRESOLVED"),
      after: run?.status ?? "NOT_RUN",
      value: run?.resolution?.value ?? null,
      discoveredFrom: run?.identifiers.map((trace: any) => ({ value: trace.normalizedValue, query: trace.discoveryQuery, source: trace.discoverySource })) ?? [],
      corroboratedBy: run?.identifiers.map((trace: any) => ({ value: trace.normalizedValue, sources: trace.matchingSources, status: trace.finalStatus })) ?? [],
      queries: run?.queries ?? [],
      cost: run?.cost ?? null,
    };
  });
  const comparison = {
    baseline: { searches: baseline?.totals?.webSearches ?? 66, pagesOpened: baseline?.totals?.pagesOpened ?? 14, braveUsd: 0.33, openAiUsd: 0.005171, totalUsd: 0.335171 },
    after: after.totals,
    rows,
  };
  await json(path.join(ROOT, "absolum-before-after.json"), comparison);
  const md = [
    "# Absolum PS5 — before / after",
    "",
    `- Before: 66 searches · $0.335171`,
    `- After: ${after.totals.queries} queries · $${after.totals.cost.totalUsd.toFixed(6)}`,
    "- Vision: 0",
    "- OCR: 0",
    "",
    "| Field | Before | After | Value | Queries | Cost |",
    "|---|---|---|---|---:|---:|",
    ...rows.map((row) => `| ${row.field} | ${row.before} | ${row.after} | ${JSON.stringify(row.value)} | ${row.queries.length} | $${row.cost?.totalUsd.toFixed(6) ?? "0.000000"} |`),
  ].join("\n");
  await writeFile(path.join(ROOT, "absolum-before-after.md"), `${md}\n`, "utf8");
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  assertResearchEngineEnabled();
  const capabilities = researchRuntimeCapabilities();
  if (!capabilities.openai || !capabilities.braveSearch) throw new Error("WORLDWIDE_BENCHMARK_REQUIRES_OPENAI_AND_BRAVE");
  if ((process.env.RESEARCH_SEARCH_PROVIDER || "").trim().toLowerCase() !== "brave") throw new Error("WORLDWIDE_BENCHMARK_REQUIRES_BRAVE");
  const before = await hashResearchCatalogBoundary();
  const store = new ResearchRunStore(path.join(ROOT, "worker"));
  const cases: any[] = [];

  if (PHASE === "all" || PHASE === "absolum") {
    const absolum = await executeCase({ caseId: "ABSOLUM-PS5", title: "Absolum", platform: "ps5", descriptors: absolumTasks(), store });
    cases.push(absolum);
    await absolumComparison(absolum);
  }
  if (PHASE === "all" || PHASE === "pilot16") {
    const startIndex = START_CASE ? PILOT_16.findIndex((definition) => definition.id === START_CASE) : 0;
    if (START_CASE && startIndex < 0) throw new Error(`UNKNOWN_START_CASE:${START_CASE}`);
    for (const definition of PILOT_16.slice(Math.max(0, startIndex))) {
      cases.push(await executeCase({ caseId: definition.id, title: definition.title, platform: definition.platform, descriptors: pilotTasks(definition.title, definition.platform), store }));
    }
  }

  const after = await hashResearchCatalogBoundary();
  const mutation = compareResearchCatalogBoundary(before, after);
  if (!mutation.identical) throw new Error(`CATALOG_OR_PRICE_MUTATION:${mutation.changed.join(",")}`);
  const summaryCases = PHASE === "pilot16"
    ? (await Promise.all(PILOT_16.map(async (definition) => readFile(path.join(ROOT, "cases", definition.id, "result.json"), "utf8").then(JSON.parse).catch(() => null)))).filter(Boolean)
    : cases;
  const summary = {
    schemaVersion: 1,
    phase: PHASE,
    gitSha: GIT_SHA,
    generatedAt: new Date().toISOString(),
    cases: summaryCases.map((row) => ({ caseId: row.caseId, title: row.title, platform: row.platform, worldwideTerminal: row.worldwideTerminal, coverageLedger: row.coverageLedger, totals: row.totals, resultHash: row.resultHash })),
    totals: {
      cases: summaryCases.length,
      worldwideTerminal: summaryCases.filter((row) => row.worldwideTerminal).length,
      queries: summaryCases.reduce((sum, row) => sum + row.totals.queries, 0),
      exactIdentifierQueries: summaryCases.reduce((sum, row) => sum + row.totals.exactIdentifierQueries, 0),
      imageUrls: summaryCases.reduce((sum, row) => sum + row.totals.imageUrls, 0),
      visionCalls: 0,
      ocrCalls: 0,
      costUsd: money(summaryCases.reduce((sum, row) => sum + row.totals.cost.totalUsd, 0)),
    },
    mutations: { catalog: 0, prices: 0, authoritativeQueue: 0, publicAssets: 0 },
  };
  await json(path.join(ROOT, `${PHASE}-summary.json`), summary);
  process.stdout.write(`${JSON.stringify(summary.totals, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
