import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicListedCatalog } from "../src/lib/catalog";
import { findResearchSubjects, getResearchSubjectById } from "../src/lib/research-engine/catalog-context";
import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { ResearchOpenAIError } from "../src/lib/research-engine/openai-provider";
import { runDurableResearchTask } from "../src/lib/research-engine/runtime";
import { ResearchSearchProviderError } from "../src/lib/research-engine/search-provider";
import { createResearchState, durableTask, researchArtifactRoot, ResearchRunStore } from "../src/lib/research-engine/state-store";
import type { ResearchSubject } from "../src/lib/research-engine/types";
import type { ResearchBudgetUsage, ResearchTargetField } from "../src/lib/research-engine/v2-types";

type PilotCase = {
  number: number;
  id: string;
  title: string;
  titleCandidates: string[];
  platformSlug: string;
  edition: string;
  editionNeedles: string[];
  region: string;
  identifiers: Array<{ type: string; value: string }>;
  targetFields: ResearchTargetField[];
  objective: string;
};

const PILOT_CASES: PilotCase[] = [
  {
    number: 1,
    id: "case-1-black-flag-resynced-ps5",
    title: "Assassin's Creed Black Flag Resynced",
    titleCandidates: ["Assassin's Creed Black Flag Resynced", "Assassin's Creed IV: Black Flag Resynced"],
    platformSlug: "ps5",
    edition: "Edition identity pending",
    editionNeedles: ["resynced"],
    region: "Europe",
    identifiers: [
      { type: "BARCODE", value: "3307216308898" },
      { type: "BARCODE", value: "3307216308904" },
    ],
    targetFields: ["CANONICAL_IDENTITY"],
    objective: "Determine what each supplied barcode identifies and distinguish Standard, Launch, Deluxe, Collector, SteelBook and retailer bundles without merging unlike products.",
  },
  {
    number: 2,
    id: "case-2-ac2-discovery-ds-spain",
    title: "Assassin's Creed II: Discovery",
    titleCandidates: ["Assassin's Creed II: Discovery"],
    platformSlug: "ds",
    edition: "Spain physical release",
    editionNeedles: ["spain", "espana", "españa"],
    region: "Spain",
    identifiers: [],
    targetFields: ["BARCODE", "BOX_CODE", "PRODUCT_CODE"],
    objective: "Find the Spanish outer barcode, Nintendo box code and cartridge/product code, keeping each physical component separate.",
  },
  {
    number: 3,
    id: "case-3-ac4-skull-wiiu-spain",
    title: "Assassin's Creed IV: Black Flag",
    titleCandidates: ["Assassin's Creed IV: Black Flag", "Assassin's Creed IV: Black Flag [Skull Edition]"],
    platformSlug: "wiiu",
    edition: "Skull Edition · Spain",
    editionNeedles: ["skull", "spain", "espana", "españa"],
    region: "Spain",
    identifiers: [],
    targetFields: ["BARCODE", "BOX_CODE", "CANONICAL_IDENTITY"],
    objective: "Find the Spanish Skull Edition barcode and box/product code while rejecting evidence attributable only to the Standard edition.",
  },
  {
    number: 4,
    id: "case-4-ezio-collection-switch",
    title: "Assassin's Creed: The Ezio Collection",
    titleCandidates: ["Assassin's Creed: The Ezio Collection", "Assassin's Creed The Ezio Collection"],
    platformSlug: "switch",
    edition: "Physical product identity pending",
    editionNeedles: ["ezio"],
    region: "Europe",
    identifiers: [],
    targetFields: ["PRODUCT_CODE", "PHYSICAL_PRODUCT_TYPE"],
    objective: "Distinguish game-card SKU from code-in-box SKU and document any download requirement without treating software language as packaging evidence.",
  },
  {
    number: 5,
    id: "case-5-brotherhood-revelations-double-pack-xbox360",
    title: "Assassin's Creed Brotherhood + Revelations Double Pack",
    titleCandidates: [
      "Assassin's Creed Brotherhood + Revelations Double Pack",
      "Assassin's Creed Brotherhood + Assassin's Creed Revelations",
    ],
    platformSlug: "xbox360",
    edition: "Double Pack",
    editionNeedles: ["double", "brotherhood", "revelations"],
    region: "Europe",
    identifiers: [
      { type: "BARCODE", value: "3307215689271" },
      { type: "BARCODE", value: "3307215689165" },
      { type: "BARCODE", value: "3307215693865" },
      { type: "BARCODE", value: "3307215673393" },
    ],
    targetFields: ["OUTER_INNER_RELATION", "CANONICAL_IDENTITY"],
    objective: "Bind each barcode to outer pack, inner game or standalone product and reject platform-contaminated evidence.",
  },
];

function normalize(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#43;|&plus;/gi, "+")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function syntheticSubject(definition: PilotCase): ResearchSubject {
  return {
    id: `pilot:${definition.id}`,
    kind: "related-release",
    catalogId: null,
    guideId: null,
    physicalEditionId: null,
    title: definition.title,
    platformSlug: definition.platformSlug,
    edition: definition.edition,
    region: definition.region,
    barcode: null,
    productCodes: [],
    serials: [],
    marketRegions: definition.region === "Spain" ? ["Spain"] : [],
    evidenceMarkets: [],
    packagingLanguages: [],
    softwareLanguages: [],
    releaseStatus: null,
    physicalProductType: null,
    containsDisc: null,
    countsAsNativePhysicalRelease: null,
    confidence: null,
    evidenceCount: 0,
    sourceCount: 0,
    notes: [definition.objective],
  };
}

function editionScore(edition: string, needles: string[]): number {
  const value = normalize(edition);
  return needles.reduce((score, needle) => score + (value.includes(normalize(needle)) ? 1 : 0), 0);
}

function resolveSubject(definition: PilotCase): ResearchSubject {
  const editionSubjects = definition.titleCandidates.flatMap((title) => findResearchSubjects({ title, platformSlug: definition.platformSlug }));
  const rankedEditions = editionSubjects
    .map((subject) => ({ subject, score: editionScore(subject.edition, definition.editionNeedles) }))
    .sort((a, b) => b.score - a.score || b.subject.evidenceCount - a.subject.evidenceCount);
  if (rankedEditions[0]?.score > 0) return rankedEditions[0].subject;

  const titles = new Set(definition.titleCandidates.map(normalize));
  const game = publicListedCatalog.find((candidate) => candidate.platformSlug === definition.platformSlug && titles.has(normalize(candidate.title)));
  const catalogSubject = game ? getResearchSubjectById(`catalog:${game.id}`) : null;
  return catalogSubject ?? syntheticSubject(definition);
}

function numericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseArgs(argv: string[]): { cases: PilotCase[]; reportOnly: boolean } {
  if (argv.includes("--report")) return { cases: [], reportOnly: true };
  if (argv.includes("--all")) return { cases: PILOT_CASES, reportOnly: false };
  const caseIndex = argv.indexOf("--case");
  if (caseIndex >= 0) {
    const number = Number.parseInt(argv[caseIndex + 1] ?? "", 10);
    const selected = PILOT_CASES.find((candidate) => candidate.number === number);
    if (!selected) throw new Error("PILOT_CASE_MUST_BE_1_TO_5");
    return { cases: [selected], reportOnly: false };
  }
  throw new Error("Usage: npm run research:pilot:assassins-creed -- --case <1-5> | --all | --report");
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function taskFor(definition: PilotCase, subject: ResearchSubject, field: ResearchTargetField) {
  return durableTask({
    id: `pilot:${definition.id}:${field.toLowerCase()}`,
    subjectId: subject.id,
    targetField: field,
    question: `${definition.objective} Target field: ${field}.`,
    priority: "P1",
    evidenceNeeded: ["EXACT_PRODUCT", "SUBJECT_BOUND_SOURCE", "COMPONENT_BOUND_EVIDENCE"],
  });
}

type CompletedTarget = { targetField: ResearchTargetField; durationMs: number; result: Awaited<ReturnType<typeof runDurableResearchTask>> };
type FailedTarget = { targetField: ResearchTargetField; error: string; usage: ResearchBudgetUsage };
type PilotBudget = { remainingUsd: number };

const EMPTY_USAGE: ResearchBudgetUsage = {
  searches: 0,
  pages: 0,
  images: 0,
  agentTurns: 0,
  browserSessions: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostUsd: 0,
};

function roundUsd(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

function isFatalProviderError(error: unknown): boolean {
  return error instanceof ResearchOpenAIError
    || error instanceof ResearchSearchProviderError
    || (error instanceof Error && /^(?:GOOGLE_SEARCH|GOOGLE_IMAGE|SERPAPI)_/.test(error.message));
}

function overallStatus(completed: CompletedTarget[], failures: Array<{ targetField: ResearchTargetField; error: string }>): string {
  if (failures.length) return "FAILED";
  const statuses = completed.map((item) => item.result.state.status);
  if (statuses.length && statuses.every((status) => status === "CONFIRMED")) return "CONFIRMED";
  if (statuses.length && statuses.every((status) => status === "UNRESOLVED")) return "UNRESOLVED";
  return statuses.length ? "PARTIAL" : "FAILED";
}

async function runCase(definition: PilotCase, pilotRoot: string, store: ResearchRunStore, pilotBudget: PilotBudget): Promise<void> {
  const directory = path.join(pilotRoot, definition.id);
  const subject = resolveSubject(definition);
  const tasks = definition.targetFields.map((field) => taskFor(definition, subject, field));
  await store.upsertTasks(tasks);
  const completed: CompletedTarget[] = [];
  const failures: FailedTarget[] = [];
  let fatalError: unknown = null;

  for (const task of tasks) {
    if (pilotBudget.remainingUsd <= 0) {
      failures.push({ targetField: task.targetField, error: "GLOBAL_PILOT_COST_BUDGET_EXHAUSTED", usage: { ...EMPTY_USAGE } });
      continue;
    }
    const runId = `${definition.id}-${task.targetField.toLowerCase()}-${randomUUID()}`;
    const state = createResearchState({
      runId,
      taskId: task.id,
      subjectId: subject.id,
      targetField: task.targetField,
      priority: task.priority,
      riskCodes: task.riskCodes,
    });
    state.identifiersSeen = definition.identifiers.map((identifier) => ({ ...identifier, component: null }));
    state.budget = {
      ...state.budget,
      maxSearches: numericEnv("RESEARCH_PILOT_MAX_SEARCHES", Math.min(4, state.budget.maxSearches)),
      maxPages: numericEnv("RESEARCH_PILOT_MAX_PAGES", Math.min(6, state.budget.maxPages)),
      maxImages: numericEnv("RESEARCH_PILOT_MAX_IMAGES", Math.min(3, state.budget.maxImages)),
      maxAgentTurns: numericEnv("RESEARCH_PILOT_MAX_AGENT_TURNS", Math.min(4, state.budget.maxAgentTurns)),
      maxBrowserSessions: numericEnv("RESEARCH_PILOT_MAX_BROWSER_SESSIONS", Math.min(2, state.budget.maxBrowserSessions)),
      maxTokens: numericEnv("RESEARCH_PILOT_MAX_TOKENS", Math.min(40_000, state.budget.maxTokens)),
      maxCostUsd: Math.min(numericEnv("RESEARCH_PILOT_MAX_COST_USD", state.budget.maxCostUsd), pilotBudget.remainingUsd),
    };
    const started = Date.now();
    try {
      const result = await runDurableResearchTask({ task, subject, store, resumeState: state, franchiseId: "assassins-creed" });
      completed.push({ targetField: task.targetField, durationMs: Date.now() - started, result });
      pilotBudget.remainingUsd = roundUsd(pilotBudget.remainingUsd - result.state.usage.estimatedCostUsd);
    } catch (error) {
      const failedState = await store.readState(runId);
      const usage = failedState?.usage ?? { ...EMPTY_USAGE };
      pilotBudget.remainingUsd = roundUsd(pilotBudget.remainingUsd - usage.estimatedCostUsd);
      failures.push({ targetField: task.targetField, error: error instanceof Error ? error.message : "UNKNOWN_PILOT_FAILURE", usage });
      if (isFatalProviderError(error)) {
        fatalError = error;
        break;
      }
    }
  }

  const queryRows = completed.flatMap((item) => item.result.state.queriesAttempted.map((query) => ({ targetField: item.targetField, query })));
  const providerUsage = completed.reduce<Record<string, number>>((totals, item) => {
    for (const [provider, calls] of Object.entries(item.result.providerUsage)) totals[provider] = (totals[provider] ?? 0) + calls;
    return totals;
  }, {});
  const usage = [...completed.map((item) => item.result.state.usage), ...failures.map((failure) => failure.usage)].reduce((total, item) => ({
    searches: total.searches + item.searches,
    pages: total.pages + item.pages,
    images: total.images + item.images,
    agentTurns: total.agentTurns + item.agentTurns,
    browserSessions: total.browserSessions + item.browserSessions,
    inputTokens: total.inputTokens + item.inputTokens,
    outputTokens: total.outputTokens + item.outputTokens,
    estimatedCostUsd: roundUsd(total.estimatedCostUsd + item.estimatedCostUsd),
  }), { searches: 0, pages: 0, images: 0, agentTurns: 0, browserSessions: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
  const visionCalls = completed.reduce((sum, item) => sum + item.result.visionResults.length, 0);
  const status = overallStatus(completed, failures);
  const resolutions = completed.map((item) => ({ targetField: item.targetField, ...item.result.resolution }));
  const costs = {
    searchCalls: usage.searches,
    googleCalls: Object.entries(providerUsage).filter(([provider]) => provider.startsWith("google-custom")).reduce((sum, [, calls]) => sum + calls, 0),
    serpApiCalls: Object.entries(providerUsage).filter(([provider]) => provider.startsWith("serpapi")).reduce((sum, [, calls]) => sum + calls, 0),
    ebayApiCalls: 0,
    pagesOpened: usage.pages,
    imagesInspected: usage.images,
    browserSessions: usage.browserSessions,
    llmCalls: Math.max(0, usage.agentTurns - visionCalls),
    visionCalls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    durationMs: completed.reduce((sum, item) => sum + item.durationMs, 0),
    providerCalls: providerUsage,
  };
  const conflicts = completed.flatMap((item) => item.result.state.conflicts);
  const claims = completed.flatMap((item) => item.result.state.claims);
  const sourceCandidates = completed.flatMap((item) => item.result.sourceCandidates);
  const catalogMutations = completed.flatMap((item) => item.result.catalogImmutability.changed);
  await Promise.all([
    writeJson(path.join(directory, "task.json"), { case: definition, subjectId: subject.id, tasks }),
    writeJson(path.join(directory, "catalog-context.json"), { subject, contexts: completed.map((item) => ({ targetField: item.targetField, context: item.result.context })) }),
    writeJson(path.join(directory, "router-plan.json"), completed.map((item) => ({ targetField: item.targetField, history: item.result.routerPlans }))),
    writeJson(path.join(directory, "source-ranking.json"), completed.map((item) => ({ targetField: item.targetField, sources: item.result.routerPlans.at(-1)?.sourcePlan ?? [] }))),
    writeJson(path.join(directory, "queries.json"), queryRows),
    writeJson(path.join(directory, "search-results.json"), completed.flatMap((item) => item.result.searchResults.map((result) => ({ targetField: item.targetField, ...result })))),
    writeJson(path.join(directory, "pages.json"), completed.flatMap((item) => item.result.pages.map((page) => ({ targetField: item.targetField, ...page })))),
    writeJson(path.join(directory, "images.json"), completed.flatMap((item) => item.result.images.map((image) => ({ targetField: item.targetField, ...image })))),
    writeJson(path.join(directory, "vision-results.json"), completed.flatMap((item) => item.result.visionResults.map((vision) => ({ targetField: item.targetField, ...vision })))),
    writeJson(path.join(directory, "evidence.json"), completed.flatMap((item) => item.result.state.evidence)),
    writeJson(path.join(directory, "claims.json"), claims),
    writeJson(path.join(directory, "conflicts.json"), conflicts),
    writeJson(path.join(directory, "rejected-hypotheses.json"), completed.flatMap((item) => item.result.state.rejectedHypotheses)),
    writeJson(path.join(directory, "resolution.json"), { status, resolutions, failures }),
    writeJson(path.join(directory, "cost.json"), costs),
    writeJson(path.join(directory, "source-candidates.json"), sourceCandidates),
    writeJson(path.join(directory, "catalog-immutability.json"), { identical: catalogMutations.length === 0, changed: [...new Set(catalogMutations)] }),
  ]);
  const summary = [
    `# ${definition.id}`,
    "",
    `- Status: ${status}`,
    `- Subject: ${subject.title} (${subject.platformSlug})`,
    `- Subject source: ${subject.id.startsWith("pilot:") ? "pilot specification; no exact catalog subject" : "current RegionAtlas catalog"}`,
    `- Targets: ${definition.targetFields.join(", ")}`,
    `- Queries: ${queryRows.length}`,
    `- Pages: ${usage.pages}`,
    `- Images: ${usage.images}`,
    `- Claims: ${claims.length}`,
    `- Conflicts: ${conflicts.length}`,
    `- Estimated cost: $${usage.estimatedCostUsd.toFixed(6)}`,
    `- Catalog mutations: ${catalogMutations.length}`,
    "",
    ...resolutions.map((resolution) => `- ${resolution.targetField}: ${resolution.status} — ${resolution.reason}`),
    ...failures.map((failure) => `- ${failure.targetField}: FAILED — ${failure.error}`),
  ].join("\n");
  await writeFile(path.join(directory, "summary.md"), `${summary}\n`, "utf8");
  console.error(`[research-engine] ${definition.id}: ${status}; cost=$${usage.estimatedCostUsd.toFixed(6)}; catalog mutations=${catalogMutations.length}`);
  if (fatalError) throw fatalError;
}

async function readJsonOrNull(filename: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeClosure(pilotRoot: string): Promise<Record<string, unknown>> {
  const rows = await Promise.all(PILOT_CASES.map(async (definition) => {
    const resolution = await readJsonOrNull(path.join(pilotRoot, definition.id, "resolution.json"));
    const cost = await readJsonOrNull(path.join(pilotRoot, definition.id, "cost.json"));
    const claims = await readJsonOrNull(path.join(pilotRoot, definition.id, "claims.json")) as unknown as Array<Record<string, unknown>> | null;
    const conflicts = await readJsonOrNull(path.join(pilotRoot, definition.id, "conflicts.json")) as unknown as Array<Record<string, unknown>> | null;
    return { definition, resolution, cost, claims: Array.isArray(claims) ? claims : [], conflicts: Array.isArray(conflicts) ? conflicts : [] };
  }));
  const statuses = rows.map((row) => String(row.resolution?.status ?? "NOT_RUN"));
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const totalCost = rows.reduce((total, row) => {
    for (const key of ["searchCalls", "pagesOpened", "imagesInspected", "llmCalls", "visionCalls", "inputTokens", "outputTokens", "estimatedCostUsd", "durationMs"] as const) {
      total[key] += number(row.cost?.[key]);
    }
    return total;
  }, { searchCalls: 0, pagesOpened: 0, imagesInspected: 0, llmCalls: 0, visionCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, durationMs: 0 });
  totalCost.estimatedCostUsd = Math.round(totalCost.estimatedCostUsd * 1_000_000) / 1_000_000;
  const unsafeFalsePositives = rows.flatMap((row) => row.claims).filter((claim) => claim.status === "VALIDATED" && Array.isArray(claim.validationErrors) && claim.validationErrors.length > 0).length;
  const crossAttributionErrors = rows.flatMap((row) => row.conflicts).filter((conflict) => String(conflict.reason).includes("CROSS_ATTRIBUTION") && String(conflict.severity) === "CRITICAL").length;
  const platformContaminationErrors = rows.flatMap((row) => row.claims).filter((claim) => claim.status === "VALIDATED" && Array.isArray(claim.validationErrors) && claim.validationErrors.some((error) => String(error).includes("PLATFORM"))).length;
  const catalogMutationDocuments = await Promise.all(PILOT_CASES.map((definition) => readJsonOrNull(path.join(pilotRoot, definition.id, "catalog-immutability.json"))));
  const catalogMutations = catalogMutationDocuments.reduce((sum, document) => sum + (Array.isArray(document?.changed) ? document.changed.length : 0), 0);
  const summary = {
    cases: PILOT_CASES.length,
    completedCases: statuses.filter((status) => status !== "NOT_RUN").length,
    confirmed: statuses.filter((status) => status === "CONFIRMED").length,
    partial: statuses.filter((status) => status === "PARTIAL").length,
    unresolved: statuses.filter((status) => status === "UNRESOLVED").length,
    failed: statuses.filter((status) => status === "FAILED").length,
    notRun: statuses.filter((status) => status === "NOT_RUN").length,
    unsafeFalsePositives,
    crossAttributionErrors,
    platformContaminationErrors,
    ...totalCost,
    catalogMutations,
  };
  const markdown = [
    "# Assassin's Creed research pilot closure",
    "",
    ...rows.map((row) => `- ${row.definition.id}: ${row.resolution?.status ?? "NOT_RUN"}`),
    "",
    `- Cases: ${summary.cases} (${summary.completedCases} completed)`,
    `- Confirmed: ${summary.confirmed}`,
    `- Partial: ${summary.partial}`,
    `- Unresolved: ${summary.unresolved}`,
    `- Failed: ${summary.failed}`,
    `- Unsafe false positives: ${summary.unsafeFalsePositives}`,
    `- Cross-attribution errors accepted: ${summary.crossAttributionErrors}`,
    `- Platform contamination errors accepted: ${summary.platformContaminationErrors}`,
    `- Search calls: ${summary.searchCalls}`,
    `- Pages: ${summary.pagesOpened}`,
    `- Images: ${summary.imagesInspected}`,
    `- LLM calls: ${summary.llmCalls}`,
    `- Vision calls: ${summary.visionCalls}`,
    `- Input tokens: ${summary.inputTokens}`,
    `- Output tokens: ${summary.outputTokens}`,
    `- Estimated cost: $${summary.estimatedCostUsd.toFixed(6)}`,
    `- Duration: ${summary.durationMs} ms`,
    `- Catalog mutations: ${summary.catalogMutations}`,
  ].join("\n");
  await mkdir(pilotRoot, { recursive: true });
  await writeFile(path.join(pilotRoot, "closure.md"), `${markdown}\n`, "utf8");
  return summary;
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const pilotRoot = path.join(researchArtifactRoot(), "pilot-assassins-creed");
  if (!args.reportOnly) {
    assertResearchEngineEnabled();
    const capabilities = researchRuntimeCapabilities();
    if (!capabilities.openai) throw new Error("OPENAI_NOT_CONFIGURED");
    if (!capabilities.googleSearch && !capabilities.serpApi) throw new Error("RESEARCH_SEARCH_NOT_CONFIGURED");
    const store = new ResearchRunStore();
    const pilotBudget: PilotBudget = { remainingUsd: numericEnv("RESEARCH_MAX_COST_USD", 1) };
    for (const definition of args.cases) {
      if (pilotBudget.remainingUsd <= 0) break;
      await runCase(definition, pilotRoot, store, pilotBudget);
    }
  }
  console.log(JSON.stringify(await writeClosure(pilotRoot), null, 2));
}

void main().catch((error) => {
  const code = error instanceof ResearchOpenAIError || error instanceof ResearchSearchProviderError
    ? error.code
    : error instanceof Error
      ? error.message
      : "RESEARCH_PILOT_FAILED";
  console.error(code);
  process.exitCode = 1;
});
