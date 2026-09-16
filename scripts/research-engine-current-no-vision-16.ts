#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- frozen benchmark artifacts retain engine payloads verbatim. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import { compareResearchCatalogBoundary, hashResearchCatalogBoundary } from "../src/lib/research-engine/catalog-immutability";
import { scanResearchCatalog } from "../src/lib/research-engine/catalog-scanner";
import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { createResearchWorkerDependencies } from "../src/lib/research-engine/runtime";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";
import { durableTaskFromFoundation } from "../src/lib/research-engine/task-bridge";
import type { ResearchScanItem } from "../src/lib/research-engine/types";
import type { ResearchTargetField } from "../src/lib/research-engine/v2-types";
import { runResearchTaskV2, type ResearchWorkerResult } from "../src/lib/research-engine/worker";

const OUTPUT_DIR = path.resolve(process.cwd(), process.argv[2] || "artifacts/research-engine/engine-current-no-vision-16");
const BRAVE_REQUEST_USD = 0.005;
const STARTED_AT = new Date().toISOString();
const GIT_SHA = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const CASES = [
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

type BenchmarkDecision = "ACCEPT_EXISTING" | "REROUTE_EXISTING" | "REJECT" | "PROPOSE_NEW_VARIANT" | "REVIEW_REQUIRED";

function normalizeTitle(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function filesUnder(target: string): Promise<string[]> {
  const entries = await readdir(target, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(target, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : [filename];
  }));
  return nested.flat();
}

async function hashPaths(paths: string[]): Promise<{ digest: string; files: Array<{ path: string; sha256: string }> }> {
  const candidates = (await Promise.all(paths.map(async (item) => {
    const absolute = path.resolve(process.cwd(), item);
    const info = await stat(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) return [];
    return info.isDirectory() ? filesUnder(absolute) : [absolute];
  }))).flat();
  const files = [];
  for (const filename of unique(candidates).sort()) {
    try {
      const content = await readFile(filename);
      files.push({ path: path.relative(process.cwd(), filename), sha256: createHash("sha256").update(content).digest("hex") });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { digest: createHash("sha256").update(files.map((row) => `${row.path}\0${row.sha256}`).join("\n")).digest("hex"), files };
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceForPage(result: ResearchWorkerResult, pageUrl: string): string {
  const exact = result.state.evidence.find((row) => row.sourceUrl === pageUrl || row.canonicalUrl === pageUrl);
  if (exact) return exact.sourceId;
  try { return new URL(pageUrl).hostname; } catch { return "unknown"; }
}

function imageUrls(result: ResearchWorkerResult) {
  const rows = result.pages.flatMap((page) => page.imageCandidates.map((candidate) => ({
    source: sourceForPage(result, page.canonicalUrl),
    pageUrl: candidate.sourcePageUrl || page.canonicalUrl,
    imageUrl: candidate.originalUrl || candidate.resolvedUrl || candidate.url,
    listingId: candidate.listingId || null,
    sourceRecordId: candidate.sourceRecordId || null,
    metadata: {
      alt: candidate.alt || null,
      caption: candidate.caption || null,
      galleryLabel: candidate.galleryLabel || null,
      acquisitionMechanisms: candidate.acquisitionMechanisms,
    },
    status: "IMAGE_URL_FOUND" as const,
  })));
  return [...new Map(rows.map((row) => [`${row.pageUrl}\0${row.imageUrl}`, row])).values()];
}

function taskSources(result: ResearchWorkerResult) {
  const planned = unique(result.routerPlans.flatMap((plan) => plan.sourcePlan.map((source) => source.sourceId)));
  const used = unique(result.state.evidence.map((evidence) => evidence.sourceId));
  return { planned, used };
}

function fieldNeedsUnanalysedImage(target: ResearchTargetField, result: ResearchWorkerResult, images: ReturnType<typeof imageUrls>): boolean {
  if (!images.length || result.state.status === "CONFIRMED") return false;
  const text = [
    ...result.state.nextEvidenceNeeded,
    ...(result.state.evidenceGaps || []).flatMap((gap) => [gap.missingProof, ...(gap.recommendedActions || [])]),
  ].join(" ");
  return ["PACKAGING_LANGUAGES", "BOX_CODE", "OUTER_INNER_RELATION"].includes(target)
    || /(?:photo|image|back.?cover|packaging|visible|readable|component)/i.test(text);
}

function contextRow(item: ResearchScanItem) {
  return {
    subject: item.subject,
    risks: item.risks,
    engineTasks: item.tasks,
    debtScore: item.debtScore,
  };
}

function decisionFor(input: {
  rawCatalog: Array<Record<string, any>>;
  scanItems: ResearchScanItem[];
  taskRuns: Array<{ result: ResearchWorkerResult | null; error: string | null }>;
}): { decision: BenchmarkDecision; reason: string } {
  const active = input.rawCatalog.filter((row) => row.listingStatus !== "excluded");
  if (active.length === 0 && input.rawCatalog.length > 0) {
    return { decision: "REJECT", reason: `All exact current catalog records are excluded: ${unique(input.rawCatalog.map((row) => row.excludeReason || "unspecified")).join(", ")}.` };
  }
  if (input.rawCatalog.length === 0) {
    return { decision: "REVIEW_REQUIRED", reason: "The current RegionAtlas catalog has no exact title/platform subject for the requested game." };
  }
  const taskCount = input.scanItems.reduce((sum, item) => sum + item.tasks.length, 0);
  if (taskCount === 0) {
    return { decision: "ACCEPT_EXISTING", reason: "The current catalog scanner generated no research risk or task for the exact active catalog subject(s)." };
  }
  if (input.taskRuns.some((run) => run.error || !run.result || run.result.state.status !== "CONFIRMED" || run.result.resolution.status !== "CONFIRMED")) {
    return { decision: "REVIEW_REQUIRED", reason: "At least one Engine-generated target remained partial, unresolved, blocked, or failed under the no-vision policy." };
  }
  return { decision: "ACCEPT_EXISTING", reason: "Every target generated by the current catalog scanner was confirmed by the current Research Engine." };
}

function markdownCase(row: Record<string, any>): string {
  const lines = [
    `# ${row.caseId} — ${row.game}`,
    "",
    `- Platform: ${row.platform}`,
    `- Decision: ${row.decision}`,
    `- Reason: ${row.decisionReason}`,
    `- Engine tasks: ${row.engineTasks.length}`,
    `- Image policy: ${row.imagePolicy}`,
    `- Image URLs found: ${row.imageUrls.length}`,
    `- Cost: $${row.cost.totalUsd.toFixed(6)}`,
    "",
    "## Initial Engine context",
    "",
    "```json",
    JSON.stringify(row.initialContext, null, 2),
    "```",
    "",
    "## Research",
    "",
    `- Sources planned: ${row.sourcesPlanned.join(", ") || "none"}`,
    `- Sources used: ${row.sourcesUsed.join(", ") || "none"}`,
    `- Direct URLs used: ${row.directUrlsUsed.length}`,
    `- Queries executed: ${row.queriesExecuted.length}`,
    `- Identifiers found: ${row.identifiersFound.length}`,
    `- Confirmed facts: ${row.confirmedFacts.length}`,
    `- Conflicts: ${row.conflicts.length}`,
    `- Unresolved fields: ${row.unresolvedFields.join(", ") || "none"}`,
    "",
    "### Direct URLs",
    "",
    ...(row.directUrlsUsed.length ? row.directUrlsUsed.map((url: string) => `- ${url}`) : ["- none"]),
    "",
    "### Queries",
    "",
    ...(row.queriesExecuted.length ? row.queriesExecuted.map((query: string) => `- ${query}`) : ["- none"]),
    "",
    "### Image URLs (not analysed)",
    "",
    ...(row.imageUrls.length ? row.imageUrls.map((image: Record<string, any>) => `- ${image.imageUrl} — page: ${image.pageUrl} — source: ${image.source} — ${image.status}`) : ["- none"]),
    "",
    "### Frozen task outcomes",
    "",
    "```json",
    JSON.stringify(row.engineTasks, null, 2),
    "```",
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  assertResearchEngineEnabled();
  const capabilities = researchRuntimeCapabilities();
  if (!capabilities.openai || !capabilities.braveSearch) throw new Error("BENCHMARK_REQUIRES_OPENAI_AND_BRAVE");
  if ((process.env.RESEARCH_SEARCH_PROVIDER || "").trim().toLowerCase() !== "brave") throw new Error("BENCHMARK_REQUIRES_BRAVE_SEARCH_PROVIDER");

  const existingManifest = path.join(OUTPUT_DIR, "frozen-results.json");
  try {
    await readFile(existingManifest);
    throw new Error(`FROZEN_BENCHMARK_ALREADY_EXISTS:${existingManifest}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const catalogBefore = await hashResearchCatalogBoundary();
  const engineConfigPaths = [
    "data/research-engine/knowledge",
    "src/lib/research-engine/router.ts",
    "src/lib/research-engine/budget.ts",
    "src/lib/research-engine/validators.ts",
    "src/lib/research-engine/task-planner.ts",
    "src/lib/research-engine/catalog-scanner.ts",
  ];
  const engineConfigBefore = await hashPaths(engineConfigPaths);
  const store = new ResearchRunStore(path.join(OUTPUT_DIR, "worker"));
  const cases: Array<Record<string, any>> = [];

  for (const definition of CASES) {
    process.stdout.write(`BENCHMARK_CASE_START ${definition.id} ${definition.title}\n`);
    const titleKey = normalizeTitle(definition.title);
    const rawCatalog = catalogData.filter((row) => row.platformSlug === definition.platform && normalizeTitle(row.title) === titleKey);
    const scan = scanResearchCatalog({ platformSlug: definition.platform, query: definition.title, limit: null, includeClean: true });
    const scanItems = scan.items.filter((item) => normalizeTitle(item.subject.title) === titleKey);
    const tasks = scanItems.flatMap((item) => item.tasks.map((task) => ({ item, task: durableTaskFromFoundation(task) })));
    const taskRuns: Array<{ task: ReturnType<typeof durableTaskFromFoundation>; result: ResearchWorkerResult | null; error: string | null }> = [];

    for (const [index, planned] of tasks.entries()) {
      const runId = `${definition.id.toLowerCase()}-${index + 1}-${planned.task.targetField.toLowerCase()}`;
      try {
        const dependencies = createResearchWorkerDependencies(store);
        dependencies.visionProvider = null;
        const result = await runResearchTaskV2({
          task: planned.task,
          subject: planned.item.subject,
          dependencies,
          rootDir: process.cwd(),
          runId,
        });
        if (result.visionResults.length !== 0 || result.state.usage.images !== 0 || Number(result.providerUsage["brave-images"] || 0) !== 0) {
          throw new Error(`NO_VISION_POLICY_BREACH:${runId}`);
        }
        taskRuns.push({ task: planned.task, result, error: null });
      } catch (error) {
        taskRuns.push({ task: planned.task, result: null, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const images = taskRuns.flatMap((run) => run.result ? imageUrls(run.result) : []);
    const dedupedImages = [...new Map(images.map((row) => [`${row.pageUrl}\0${row.imageUrl}`, row])).values()];
    const decision = decisionFor({ rawCatalog, scanItems, taskRuns });
    const taskResults = taskRuns.map((run) => {
      const sources = run.result ? taskSources(run.result) : { planned: [], used: [] };
      const runImages = run.result ? imageUrls(run.result) : [];
      return {
        taskId: run.task.id,
        subjectId: run.task.subjectId,
        targetField: run.task.targetField,
        question: run.task.question,
        riskCodes: run.task.riskCodes,
        status: run.result?.state.status || "FAILED",
        resolution: run.result?.resolution || null,
        whyStopped: run.result?.state.whyStopped || run.error,
        sourcesPlanned: sources.planned,
        sourcesUsed: sources.used,
        queriesExecuted: run.result?.state.queriesAttempted || [],
        directUrlsUsed: run.result?.state.urlsVisited || [],
        identifiersFound: run.result?.state.identifiersSeen || [],
        validatedClaims: (run.result?.state.claims || []).filter((claim) => claim.status === "VALIDATED"),
        candidateClaims: (run.result?.state.claims || []).filter((claim) => claim.status !== "VALIDATED"),
        conflicts: run.result?.state.conflicts || [],
        evidenceGaps: run.result?.state.evidenceGaps || [],
        imageEvidenceAvailableNotAnalyzed: run.result ? fieldNeedsUnanalysedImage(run.task.targetField, run.result, runImages) : false,
        imageUrlsFound: runImages.length,
        technicalFailures: run.result?.technicalFailures || [],
        providerUsage: run.result?.providerUsage || {},
        cost: {
          openAiUsd: money(run.result?.state.usage.estimatedCostUsd || 0),
          braveUsd: money((Number(run.result?.providerUsage["brave-search"] || 0) + Number(run.result?.providerUsage["brave-images"] || 0)) * BRAVE_REQUEST_USD),
        },
        artifactDirectory: run.result?.artifactDirectory || null,
        error: run.error,
      };
    });
    const openAiUsd = taskResults.reduce((sum, task) => sum + task.cost.openAiUsd, 0);
    const braveUsd = taskResults.reduce((sum, task) => sum + task.cost.braveUsd, 0);
    const row: Record<string, any> = {
      schemaVersion: 1,
      caseId: definition.id,
      game: definition.title,
      platform: definition.platform,
      benchmarkGitSha: GIT_SHA,
      initialContext: {
        exactCatalogRecords: rawCatalog.map((catalog) => ({
          id: catalog.id,
          title: catalog.title,
          region: catalog.region,
          edition: catalog.edition,
          listingStatus: catalog.listingStatus,
          excludeReason: catalog.excludeReason || null,
          matchConfidence: catalog.matchConfidence || null,
          marketRegion: catalog.marketRegion || null,
          languages: catalog.languages || [],
          canonicalSerials: catalog.canonicalSerials || [],
          resolutionSerials: catalog.resolutionSerials || [],
          sourceSerials: catalog.sourceSerials || [],
        })),
        scannerSubjects: scanItems.map(contextRow),
        scannerGeneratedTaskCount: tasks.length,
      },
      sourcesPlanned: unique(taskResults.flatMap((task) => task.sourcesPlanned)),
      sourcesUsed: unique(taskResults.flatMap((task) => task.sourcesUsed)),
      directUrlsUsed: unique(taskResults.flatMap((task) => task.directUrlsUsed)),
      queriesExecuted: taskResults.flatMap((task) => task.queriesExecuted),
      identifiersFound: taskResults.flatMap((task) => task.identifiersFound),
      variantsRegionsDiscovered: taskResults.flatMap((task) => [task.resolution?.value, ...task.candidateClaims.map((claim: Record<string, any>) => claim.value)]).filter((value) => value !== null && value !== undefined),
      confirmedFacts: taskResults.flatMap((task) => task.status === "CONFIRMED" && task.resolution
        ? [{ field: task.targetField, value: task.resolution.value, score: task.resolution.score, sourceIds: task.resolution.sourceIds }]
        : []),
      conflicts: taskResults.flatMap((task) => task.conflicts),
      unresolvedFields: taskResults.filter((task) => task.status !== "CONFIRMED").map((task) => task.targetField),
      imageUrls: dedupedImages,
      imagePolicy: dedupedImages.length && taskResults.some((task) => task.imageEvidenceAvailableNotAnalyzed)
        ? "IMAGE_EVIDENCE_AVAILABLE_NOT_ANALYZED"
        : dedupedImages.length ? "IMAGE_URL_FOUND" : "NO_IMAGE_URL_FOUND",
      onlyRemainingEvidenceRequiresImageAnalysis: taskResults.length > 0 && taskResults.filter((task) => task.status !== "CONFIRMED").length > 0
        && taskResults.filter((task) => task.status !== "CONFIRMED").every((task) => task.imageEvidenceAvailableNotAnalyzed),
      engineTasks: taskResults,
      decision: decision.decision,
      decisionReason: decision.reason,
      reasonForReview: decision.decision === "REVIEW_REQUIRED" ? decision.reason : null,
      cost: { openAiUsd: money(openAiUsd), braveUsd: money(braveUsd), totalUsd: money(openAiUsd + braveUsd) },
      mutations: { catalog: 0, prices: 0, authoritativeQueue: 0, publicAssets: 0 },
      frozenAt: new Date().toISOString(),
    };
    row.resultHash = hashJson(row);
    const caseDir = path.join(OUTPUT_DIR, "cases", definition.id);
    await writeJson(path.join(caseDir, "result.json"), row);
    await writeJson(path.join(caseDir, "image-urls.json"), { policy: "NO_VISION_NO_OCR", images: dedupedImages });
    await writeFile(path.join(caseDir, "report.md"), markdownCase(row), "utf8");
    cases.push(row);
    process.stdout.write(`BENCHMARK_CASE_FROZEN ${definition.id} ${row.decision} ${row.resultHash}\n`);
  }

  const catalogAfter = await hashResearchCatalogBoundary();
  const engineConfigAfter = await hashPaths(engineConfigPaths);
  const catalogComparison = compareResearchCatalogBoundary(catalogBefore, catalogAfter);
  if (!catalogComparison.identical) throw new Error(`CATALOG_OR_PRICE_MUTATION:${catalogComparison.changed.join(",")}`);
  if (engineConfigBefore.digest !== engineConfigAfter.digest) throw new Error("ENGINE_CONFIGURATION_MUTATION_DETECTED");

  const totalCost = cases.reduce((sum, row) => sum + row.cost.totalUsd, 0);
  const byPlatform = Object.fromEntries(unique(cases.map((row) => row.platform)).map((platform) => {
    const rows = cases.filter((row) => row.platform === platform);
    return [platform, {
      total: rows.length,
      resolved: rows.filter((row) => row.decision !== "REVIEW_REQUIRED").length,
      reviewRequired: rows.filter((row) => row.decision === "REVIEW_REQUIRED").length,
      decisions: Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "PROPOSE_NEW_VARIANT", "REVIEW_REQUIRED"].map((decision) => [decision, rows.filter((row) => row.decision === decision).length])),
    }];
  }));
  const summary = {
    schemaVersion: 1,
    benchmark: "CURRENT_ENGINE_NO_VISION_16",
    startedAt: STARTED_AT,
    completedAt: new Date().toISOString(),
    gitSha: GIT_SHA,
    constraints: {
      currentEngineOnly: true,
      knowledgeModifiedBeforeRun: false,
      routingModifiedBeforeRun: false,
      thresholdsModifiedBeforeRun: false,
      rulesModifiedBeforeRun: false,
      visionEnabled: false,
      ocrEnabled: false,
      imageSemanticsAllowed: false,
      researchProvider: process.env.RESEARCH_SEARCH_PROVIDER,
      textModel: capabilities.textModel,
    },
    totals: {
      cases: cases.length,
      investigable: cases.filter((row) => row.initialContext.scannerSubjects.length > 0).length,
      externallyResearched: cases.filter((row) => row.engineTasks.length > 0).length,
      resolved: cases.filter((row) => row.decision !== "REVIEW_REQUIRED").length,
      reviewRequired: cases.filter((row) => row.decision === "REVIEW_REQUIRED").length,
      decisions: Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "PROPOSE_NEW_VARIANT", "REVIEW_REQUIRED"].map((decision) => [decision, cases.filter((row) => row.decision === decision).length])),
      sourcesActuallyUsed: unique(cases.flatMap((row) => row.sourcesUsed)),
      casesWithImageUrls: cases.filter((row) => row.imageUrls.length > 0).length,
      imageUrlCoveragePct: money(cases.filter((row) => row.imageUrls.length > 0).length / cases.length * 100),
      imageOnlyRemainingCases: cases.filter((row) => row.onlyRemainingEvidenceRequiresImageAnalysis).length,
      imageOnlyRemainingPct: money(cases.filter((row) => row.onlyRemainingEvidenceRequiresImageAnalysis).length / cases.length * 100),
      costUsd: money(totalCost),
      costPerCaseUsd: money(totalCost / cases.length),
      braveSearchCalls: cases.reduce((sum, row) => sum + row.engineTasks.reduce((taskSum: number, task: Record<string, any>) => taskSum + Number(task.providerUsage["brave-search"] || 0), 0), 0),
      braveImageCalls: 0,
      visionCalls: 0,
      ocrCalls: 0,
    },
    resolutionByPlatform: byPlatform,
    invariants: {
      engineConfiguration: { before: engineConfigBefore.digest, after: engineConfigAfter.digest, identical: engineConfigBefore.digest === engineConfigAfter.digest },
      catalogAndPrices: { before: catalogBefore.digest, after: catalogAfter.digest, identical: catalogComparison.identical, changed: catalogComparison.changed },
      catalogMutations: 0,
      priceMutations: 0,
      authoritativeQueueMutations: 0,
      publicAssetMutations: 0,
    },
    cases: cases.map((row) => ({
      caseId: row.caseId,
      game: row.game,
      platform: row.platform,
      engineTasks: row.engineTasks.length,
      decision: row.decision,
      reasonForReview: row.reasonForReview,
      imagePolicy: row.imagePolicy,
      imageUrlsFound: row.imageUrls.length,
      cost: row.cost,
      resultHash: row.resultHash,
    })),
  };
  summary["freezeHash" as keyof typeof summary] = hashJson(summary) as never;
  await writeJson(path.join(OUTPUT_DIR, "frozen-results.json"), { ...summary, casesDetailed: cases });
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  const summaryLines = [
    "# Current RegionAtlas Research Engine benchmark — 16 games — no Vision/OCR",
    "",
    `- Git SHA: ${GIT_SHA}`,
    `- Cases: ${summary.totals.cases}`,
    `- Investigable by current scanner: ${summary.totals.investigable}`,
    `- Cases with Engine-generated research tasks: ${summary.totals.externallyResearched}`,
    `- Resolved: ${summary.totals.resolved}`,
    `- Review required: ${summary.totals.reviewRequired}`,
    `- Image URL coverage: ${summary.totals.imageUrlCoveragePct}%`,
    `- Only remaining evidence requires image analysis: ${summary.totals.imageOnlyRemainingPct}%`,
    `- Total cost: $${summary.totals.costUsd.toFixed(6)}`,
    `- Cost per case: $${summary.totals.costPerCaseUsd.toFixed(6)}`,
    "- CATALOG MUTATIONS = 0",
    "- PRICE MUTATIONS = 0",
    "- AUTHORITATIVE QUEUE MUTATIONS = 0",
    "- PUBLIC ASSET MUTATIONS = 0",
    "",
    "| Case | Platform | Game | Tasks | Decision | Images | Cost |",
    "|---|---|---|---:|---|---:|---:|",
    ...cases.map((row) => `| ${row.caseId} | ${row.platform} | ${row.game} | ${row.engineTasks.length} | ${row.decision} | ${row.imageUrls.length} | $${row.cost.totalUsd.toFixed(6)} |`),
  ];
  await writeFile(path.join(OUTPUT_DIR, "report.md"), `${summaryLines.join("\n")}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary.totals, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
