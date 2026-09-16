import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicListedCatalog } from "../src/lib/catalog";
import { findResearchSubjects, getResearchSubjectById } from "../src/lib/research-engine/catalog-context";
import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { ResearchOpenAIError } from "../src/lib/research-engine/openai-provider";
import { createResearchWorkerDependencies, runDurableResearchTask } from "../src/lib/research-engine/runtime";
import { BRAVE_SEARCH_COST_USD_PER_CALL, ResearchSearchProviderError } from "../src/lib/research-engine/search-provider";
import { createResearchState, durableTask, researchArtifactRoot, ResearchRunStore } from "../src/lib/research-engine/state-store";
import type { ResearchSubject } from "../src/lib/research-engine/types";
import type { ResearchBudgetUsage, ResearchProviderHealth, ResearchState, ResearchTargetField } from "../src/lib/research-engine/v2-types";

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
type PilotVersion = "v2" | "v3" | "v4";

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

function parseArgs(argv: string[]): { cases: PilotCase[]; reportOnly: boolean; version: PilotVersion } {
  const versionIndex = argv.indexOf("--version");
  const versionValue = versionIndex >= 0 ? argv[versionIndex + 1] : "v2";
  if (!["v2", "v3", "v4"].includes(versionValue ?? "")) throw new Error("PILOT_VERSION_MUST_BE_V2_V3_OR_V4");
  const version = versionValue as PilotVersion;
  if (argv.includes("--report")) return { cases: [], reportOnly: true, version };
  if (argv.includes("--all")) return { cases: PILOT_CASES, reportOnly: false, version };
  const caseIndex = argv.indexOf("--case");
  if (caseIndex >= 0) {
    const number = Number.parseInt(argv[caseIndex + 1] ?? "", 10);
    const selected = PILOT_CASES.find((candidate) => candidate.number === number);
    if (!selected) throw new Error("PILOT_CASE_MUST_BE_1_TO_5");
    return { cases: [selected], reportOnly: false, version };
  }
  throw new Error("Usage: npm run research:pilot:assassins-creed -- --case <1-5> | --all | --report");
}

function caseDirectory(pilotRoot: string, definition: PilotCase, version: PilotVersion): string {
  return path.join(pilotRoot, version === "v3" || version === "v4" ? `case-${definition.number}` : definition.id);
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function taskFor(definition: PilotCase, subject: ResearchSubject, field: ResearchTargetField, version: PilotVersion) {
  return durableTask({
    id: `pilot:${version}:${definition.id}:${field.toLowerCase()}`,
    subjectId: subject.id,
    targetField: field,
    question: `${definition.objective} Target field: ${field}.`,
    priority: "P1",
    evidenceNeeded: ["EXACT_PRODUCT", "SUBJECT_BOUND_SOURCE", "COMPONENT_BOUND_EVIDENCE"],
  });
}

type CompletedTarget = { targetField: ResearchTargetField; durationMs: number; result: Awaited<ReturnType<typeof runDurableResearchTask>> };
type FailedTarget = { targetField: ResearchTargetField; error: string; usage: ResearchBudgetUsage };
type PilotBudget = {
  remainingSearches: number;
  remainingPages: number;
  remainingImages: number;
  remainingAgentTurns: number;
  remainingBrowserSessions: number;
  remainingTokens: number;
  remainingUsd: number;
};

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

function braveCost(providerUsage: Record<string, number>): number {
  const calls = (providerUsage["brave-search"] ?? 0) + (providerUsage["brave-images"] ?? 0);
  return roundUsd(calls * BRAVE_SEARCH_COST_USD_PER_CALL);
}

function consumePilotBudget(budget: PilotBudget, usage: ResearchBudgetUsage, providerUsage: Record<string, number> = {}): void {
  budget.remainingSearches = Math.max(0, budget.remainingSearches - usage.searches);
  budget.remainingPages = Math.max(0, budget.remainingPages - usage.pages);
  budget.remainingImages = Math.max(0, budget.remainingImages - usage.images);
  budget.remainingAgentTurns = Math.max(0, budget.remainingAgentTurns - usage.agentTurns);
  budget.remainingBrowserSessions = Math.max(0, budget.remainingBrowserSessions - usage.browserSessions);
  budget.remainingTokens = Math.max(0, budget.remainingTokens - usage.inputTokens - usage.outputTokens);
  budget.remainingUsd = roundUsd(budget.remainingUsd - usage.estimatedCostUsd - braveCost(providerUsage));
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
  if (statuses.length && statuses.every((status) => status === "BLOCKED_INFRASTRUCTURE")) return "BLOCKED_INFRASTRUCTURE";
  if (statuses.length && statuses.every((status) => status === "UNRESOLVED")) return "UNRESOLVED";
  if (statuses.some((status) => status === "CONFIRMED" || status === "PARTIAL")) return "PARTIAL";
  if (statuses.some((status) => status === "BLOCKED_INFRASTRUCTURE")) return "BLOCKED_INFRASTRUCTURE";
  return statuses.length ? "PARTIAL" : "FAILED";
}

async function runPreflight(pilotRoot: string, store: ResearchRunStore, version: PilotVersion) {
  const dependencies = createResearchWorkerDependencies(store);
  const capabilities = researchRuntimeCapabilities();
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  let providerHealth: ResearchProviderHealth[] = [];
  try {
    providerHealth = await dependencies.searchProvider?.preflight?.() ?? [];
  } catch (error) {
    checks.brave = { ok: false, detail: error instanceof Error ? error.message.slice(0, 300) : "PROVIDER_PREFLIGHT_FAILED" };
  }
  const checkedAt = new Date().toISOString();
  const configuredProviders = [
    { provider: "brave-search", configured: capabilities.braveSearch },
    { provider: "google-custom-search", configured: capabilities.googleSearch },
    { provider: "serpapi-google", configured: capabilities.serpApi },
  ];
  for (const candidate of configuredProviders) {
    if (!providerHealth.some((row) => row.provider === candidate.provider)) {
      providerHealth.push({
        provider: candidate.provider,
        state: candidate.configured ? "DEGRADED" : "NOT_CONFIGURED",
        checkedAt,
        failureCode: null,
        detail: candidate.configured ? "Fallback not probed because the primary preflight is authoritative." : "Credential not configured.",
      });
    }
  }
  providerHealth.sort((left, right) => configuredProviders.findIndex((row) => row.provider === left.provider) - configuredProviders.findIndex((row) => row.provider === right.provider));
  const healthDetail = (provider: string) => {
    const health = providerHealth.find((row) => row.provider === provider);
    return health ? `${health.state}${health.failureCode ? ` / ${health.failureCode}` : ""}` : "NOT_CONFIGURED";
  };
  const braveHealth = providerHealth.find((row) => row.provider === "brave-search");
  checks.brave = { ok: braveHealth?.state === "HEALTHY", detail: healthDetail("brave-search") };
  checks.google = { ok: true, detail: healthDetail("google-custom-search") };
  checks.serpApi = { ok: true, detail: healthDetail("serpapi-google") };
  try {
    await dependencies.browserProvider?.browse(process.env.REGION_ATLAS_BASE_URL?.trim() || "https://www.regionatlas.games/");
    checks.browser = { ok: true, detail: dependencies.browserProvider?.name ?? "browser" };
  } catch (error) {
    checks.browser = { ok: false, detail: error instanceof Error ? error.message.slice(0, 300) : "BROWSER_PREFLIGHT_FAILED" };
  } finally {
    await dependencies.browserProvider?.close().catch(() => undefined);
  }
  try {
    const cover = process.env.RESEARCH_PREFLIGHT_IMAGE_URL?.trim()
      || "/catalog-covers/ps3/ac-regional-2026-09-13/original/o109.jpg";
    if (!dependencies.visionProvider) throw new Error("VISION_NOT_CONFIGURED");
    const base = process.env.REGION_ATLAS_BASE_URL?.trim() || "https://www.regionatlas.games/";
    const inspected = await dependencies.visionProvider.inspect({ imageUrl: new URL(cover, base).toString(), requestedFields: ["CANONICAL_IDENTITY"] });
    checks.vision = { ok: inspected.usage.calls >= 1, detail: `${inspected.usage.model ?? "vision-model"}; calls=${inspected.usage.calls}; image=${cover}` };
  } catch (error) {
    checks.vision = { ok: false, detail: error instanceof Error ? error.message.slice(0, 300) : "VISION_PREFLIGHT_FAILED" };
  }
  try {
    const marker = { checkedAt: new Date().toISOString(), mode: "RESEARCH_ONLY" };
    await store.writeArtifact(`pilot-${version}-preflight`, "storage-check.json", marker);
    const readback = await store.readArtifact(`pilot-${version}-preflight`, "storage-check.json", () => null as typeof marker | null);
    checks.localStorage = { ok: readback?.mode === "RESEARCH_ONLY", detail: "Research artifact write/read succeeded." };
  } catch (error) {
    checks.localStorage = { ok: false, detail: error instanceof Error ? error.message.slice(0, 300) : "STORAGE_PREFLIGHT_FAILED" };
  }
  const providerUsage = dependencies.searchProvider?.getUsage?.() ?? {};
  const braveSearchCalls = providerUsage["brave-search"] ?? 0;
  const result = {
    status: checks.brave.ok && checks.browser.ok && checks.vision.ok && checks.localStorage.ok ? "READY" : "PRECHECK_BLOCKED",
    checkedAt: new Date().toISOString(),
    checks,
    providerHealth,
    providerUsage,
    braveSearchCalls,
    estimatedBraveCostUsd: roundUsd(braveSearchCalls * BRAVE_SEARCH_COST_USD_PER_CALL),
  };
  await writeJson(path.join(pilotRoot, "preflight.json"), result);
  return result;
}

async function runCase(definition: PilotCase, pilotRoot: string, store: ResearchRunStore, pilotBudget: PilotBudget, version: PilotVersion): Promise<void> {
  const directory = caseDirectory(pilotRoot, definition, version);
  const subject = resolveSubject(definition);
  const tasks = definition.targetFields.map((field) => taskFor(definition, subject, field, version));
  await store.upsertTasks(tasks);
  const completed: CompletedTarget[] = [];
  const failures: FailedTarget[] = [];
  let sharedIdentifiers: ResearchState["identifiersSeen"] = definition.identifiers.map((identifier) => ({ ...identifier, component: null }));
  let fatalError: unknown = null;

  for (const [taskIndex, task] of tasks.entries()) {
    if (pilotBudget.remainingUsd <= 0 || pilotBudget.remainingSearches <= 0 || pilotBudget.remainingPages <= 0 || pilotBudget.remainingAgentTurns <= 0 || pilotBudget.remainingTokens <= 0) {
      failures.push({ targetField: task.targetField, error: "GLOBAL_PILOT_BUDGET_EXHAUSTED", usage: { ...EMPTY_USAGE } });
      continue;
    }
    const runId = `${version}-${definition.id}-${task.targetField.toLowerCase()}-${randomUUID()}`;
    const state = createResearchState({
      runId,
      taskId: task.id,
      subjectId: subject.id,
      targetField: task.targetField,
      priority: task.priority,
      riskCodes: task.riskCodes,
    });
    state.identifiersSeen = sharedIdentifiers;
    const targetsRemaining = tasks.length - taskIndex;
    const fairShare = (remaining: number) => Math.max(0, Math.ceil(remaining / targetsRemaining));
    state.budget = {
      ...state.budget,
      maxSearches: fairShare(pilotBudget.remainingSearches),
      maxPages: fairShare(pilotBudget.remainingPages),
      maxImages: fairShare(pilotBudget.remainingImages),
      maxAgentTurns: fairShare(pilotBudget.remainingAgentTurns),
      maxBrowserSessions: fairShare(pilotBudget.remainingBrowserSessions),
      maxTokens: fairShare(pilotBudget.remainingTokens),
      maxCostUsd: pilotBudget.remainingUsd / targetsRemaining,
    };
    const started = Date.now();
    try {
      const result = await runDurableResearchTask({ task, subject, store, resumeState: state, franchiseId: "assassins-creed" });
      completed.push({ targetField: task.targetField, durationMs: Date.now() - started, result });
      sharedIdentifiers = [...new Map([...sharedIdentifiers, ...result.state.identifiersSeen].map((identifier) => [`${identifier.type}:${identifier.value}`, identifier])).values()];
      consumePilotBudget(pilotBudget, result.state.usage, result.providerUsage);
    } catch (error) {
      const failedState = await store.readState(runId);
      const usage = failedState?.usage ?? { ...EMPTY_USAGE };
      consumePilotBudget(pilotBudget, usage);
      failures.push({ targetField: task.targetField, error: error instanceof Error ? error.message : "UNKNOWN_PILOT_FAILURE", usage });
      if (isFatalProviderError(error)) {
        fatalError = error;
        break;
      }
    }
  }

  const queryRows = completed.flatMap((item) => {
    const planned = new Map(item.result.routerPlans.flatMap((plan) => plan.queryPlan).map((row) => [normalize(row.query), row]));
    return item.result.state.queriesAttempted.map((query) => {
      const match = planned.get(normalize(query));
      return {
        targetField: item.targetField,
        query,
        strategy: match?.strategy ?? "IMAGE",
        sourceId: match?.sourceId ?? null,
        identifierType: match?.identifierType ?? null,
        identifierValue: match?.identifierValue ?? null,
      };
    });
  });
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
  const visionCalls = completed.reduce((sum, item) => sum + item.result.visionResults.reduce((calls, row) => calls + (row.usage?.calls ?? 1), 0), 0);
  const status = overallStatus(completed, failures);
  const resolutions = completed.map((item) => ({ targetField: item.targetField, ...item.result.resolution }));
  const braveWebCalls = providerUsage["brave-search"] ?? 0;
  const braveImageCalls = providerUsage["brave-images"] ?? 0;
  const braveSearchCalls = braveWebCalls + braveImageCalls;
  const estimatedBraveCostUsd = roundUsd(braveSearchCalls * BRAVE_SEARCH_COST_USD_PER_CALL);
  const costs = {
    searchCalls: usage.searches,
    braveSearchCalls,
    braveWebCalls,
    braveImageCalls,
    googleCalls: Object.entries(providerUsage).filter(([provider]) => provider.startsWith("google-custom")).reduce((sum, [, calls]) => sum + calls, 0),
    serpApiCalls: Object.entries(providerUsage).filter(([provider]) => provider.startsWith("serpapi")).reduce((sum, [, calls]) => sum + calls, 0),
    ebayApiCalls: 0,
    pagesOpened: usage.pages,
    imagesInspected: usage.images,
    browserSessions: usage.browserSessions,
    llmCalls: Math.max(0, usage.agentTurns - completed.reduce((sum, item) => sum + item.result.visionResults.length, 0)),
    visionCalls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedOpenAiCostUsd: usage.estimatedCostUsd,
    estimatedBraveCostUsd,
    estimatedTotalCostUsd: roundUsd(usage.estimatedCostUsd + estimatedBraveCostUsd),
    // Kept for compatibility with Pilot 1; this is OpenAI cost only.
    estimatedCostUsd: usage.estimatedCostUsd,
    durationMs: completed.reduce((sum, item) => sum + item.durationMs, 0),
    providerCalls: providerUsage,
  };
  const conflicts = completed.flatMap((item) => item.result.state.conflicts);
  const claims = completed.flatMap((item) => item.result.state.claims);
  const sourceCandidates = completed.flatMap((item) => item.result.sourceCandidates);
  const catalogMutations = completed.flatMap((item) => item.result.catalogImmutability.changed);
  const evidenceTimeline = completed.flatMap((item) => item.result.state.evidence.map((evidence) => ({ targetField: item.targetField, at: evidence.fetchedAt, evidenceId: evidence.id, sourceId: evidence.sourceId, sourceUrl: evidence.sourceUrl, evidenceType: evidence.evidenceType })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const imageCandidates = completed.flatMap((item) => item.result.pages.flatMap((page) => page.imageCandidates.map((candidate) => ({ targetField: item.targetField, ...candidate }))));
  const evidenceImages = completed.flatMap((item) => item.result.state.evidence.filter((row) => row.imageUrl).map((row) => ({ targetField: item.targetField, evidenceId: row.id, sourcePageUrl: row.sourcePageUrl ?? row.canonicalUrl, originalUrl: row.originalImageUrl ?? row.imageUrl, resolvedUrl: row.resolvedImageUrl ?? row.imageUrl, contentHash: row.imageHash, sourceId: row.sourceId, sourceRecordId: row.sourceRecordId ?? null, listingId: row.listingId ?? null, subjectClass: row.subjectClass ?? "UNREADABLE", platformClassification: row.platformClassification ?? null, editionClassification: row.editionClassification ?? null, editionClass: row.editionClass ?? "UNKNOWN", visibleEditionMarker: row.visibleEditionMarker ?? null, component: row.component, marketBindingState: row.marketBindingState ?? "UNBOUND", marketEvidence: row.marketEvidence ?? [], languageEvidence: row.languageEvidence ?? [], extractedIdentifiers: row.extractedIdentifiers ?? [], bindingState: row.bindingState ?? "UNBOUND", productNodeId: row.productNodeId ?? null, componentNodeId: row.componentNodeId ?? null, model: row.visionModel ?? null, schemaVersion: row.visionSchemaVersion ?? 1 })));
  const identifierBindings = completed.flatMap((item) => item.result.state.identifierBindings ?? []);
  const visionExtractions = completed.flatMap((item) => item.result.visionResults.map((vision) => ({ targetField: item.targetField, ...vision })));
  const sourcePages = completed.flatMap((item) => item.result.pages.map((page) => {
    const { imageCandidates: pageImages, ...sourcePage } = page;
    return { targetField: item.targetField, ...sourcePage, imageCandidateCount: pageImages.length };
  }));
  const galleryPages = sourcePages.filter((page) => page.imageCandidateCount > 0);
  const imageResolution = imageCandidates.map((candidate) => ({
    targetField: candidate.targetField,
    sourcePageUrl: candidate.sourcePageUrl,
    thumbnailUrl: candidate.thumbnailUrl,
    originalUrl: candidate.originalUrl,
    resolvedUrl: candidate.resolvedUrl,
    canonicalUrl: candidate.canonicalUrl,
    acquisitionMechanisms: candidate.acquisitionMechanisms,
  }));
  const fallbackEvents = completed.flatMap((item) => item.result.retrievalEvents
    .filter((event) => event.outcome === "RETRY" || event.outcome === "FAILOVER" || event.outcome === "OPEN_CIRCUIT")
    .map((event) => ({ targetField: item.targetField, ...event })));
  const productNodes = completed.flatMap((item) => item.result.state.productNodes ?? []);
  const productRelations = completed.flatMap((item) => item.result.state.productRelations ?? []);
  const physicalMetrics = completed.reduce((total, item) => {
    for (const [key, value] of Object.entries(item.result.state.physicalMetrics ?? {})) total[key] = (total[key] ?? 0) + Number(value ?? 0);
    return total;
  }, {} as Record<string, number>);
  const citationLines = [...new Map(evidenceTimeline.filter((row) => row.sourceUrl).map((row) => [row.sourceUrl, `- [${row.sourceId}](${row.sourceUrl}) — ${row.targetField}, ${row.evidenceType}`])).values()];
  await Promise.all([
    writeJson(path.join(directory, "task.json"), { case: definition, subjectId: subject.id, tasks }),
    writeJson(path.join(directory, "catalog-context.json"), { subject, contexts: completed.map((item) => ({ targetField: item.targetField, context: item.result.context })) }),
    writeJson(path.join(directory, "router-plan.json"), completed.map((item) => ({ targetField: item.targetField, history: item.result.routerPlans }))),
    writeJson(path.join(directory, "source-ranking.json"), completed.map((item) => ({ targetField: item.targetField, sources: item.result.routerPlans.at(-1)?.sourcePlan ?? [] }))),
    writeJson(path.join(directory, "queries.json"), queryRows),
    writeJson(path.join(directory, "query-strategies.json"), queryRows),
    writeJson(path.join(directory, "search-results.json"), completed.flatMap((item) => item.result.searchResults.map((result) => ({ targetField: item.targetField, ...result })))),
    writeJson(path.join(directory, "pages.json"), completed.flatMap((item) => item.result.pages.map((page) => ({ targetField: item.targetField, ...page })))),
    writeJson(path.join(directory, "images.json"), completed.flatMap((item) => item.result.images.map((image) => ({ targetField: item.targetField, ...image })))),
    writeJson(path.join(directory, "image-candidates.json"), imageCandidates),
    writeJson(path.join(directory, "source-pages.json"), sourcePages),
    writeJson(path.join(directory, "gallery-pages.json"), galleryPages),
    writeJson(path.join(directory, "image-resolution.json"), imageResolution),
    writeJson(path.join(directory, "evidence-images.json"), evidenceImages),
    writeJson(path.join(directory, "subject-classifications.json"), completed.flatMap((item) => item.result.visionResults.map((row) => ({ targetField: item.targetField, imageUrl: row.imageUrl, subjectClass: row.result.subjectClass ?? "UNREADABLE", stage: row.result.visualStages?.subject ?? "UNREADABLE" })))),
    writeJson(path.join(directory, "subject-classification.json"), completed.flatMap((item) => item.result.visionResults.map((row) => ({ targetField: item.targetField, imageUrl: row.imageUrl, subjectClass: row.result.subjectClass ?? "UNREADABLE", editionClass: row.result.editionClass ?? "UNKNOWN", visibleEditionMarker: row.result.visibleEditionMarker ?? null, stage: row.result.visualStages?.subject ?? "UNREADABLE" })))),
    writeJson(path.join(directory, "component-classifications.json"), completed.flatMap((item) => item.result.visionResults.map((row) => ({ targetField: item.targetField, imageUrl: row.imageUrl, component: row.result.component, stage: row.result.visualStages?.component ?? "UNREADABLE" })))),
    writeJson(path.join(directory, "component-classification.json"), completed.flatMap((item) => item.result.visionResults.map((row) => ({ targetField: item.targetField, imageUrl: row.imageUrl, component: row.result.component, stage: row.result.visualStages?.component ?? "UNREADABLE" })))),
    writeJson(path.join(directory, "vision-extractions.json"), visionExtractions),
    writeJson(path.join(directory, "identifier-bindings.json"), identifierBindings),
    writeJson(path.join(directory, "identifier-candidates.json"), identifierBindings.filter((row) => row.state !== "REJECTED")),
    writeJson(path.join(directory, "rejected-identifiers.json"), identifierBindings.filter((row) => row.state === "REJECTED")),
    writeJson(path.join(directory, "product-graph.json"), { nodes: [...new Map(productNodes.map((row) => [row.id, row])).values()], relations: [...new Map(productRelations.map((row) => [`${row.fromNodeId}:${row.relation}:${row.toNodeId}`, row])).values()] }),
    writeJson(path.join(directory, "market-binding.json"), evidenceImages.map((row) => ({ evidenceId: row.evidenceId, marketBindingState: row.marketBindingState }))),
    writeJson(path.join(directory, "mode-transitions.json"), completed.flatMap((item) => item.result.state.modeTransitions ?? [])),
    writeJson(path.join(directory, "physical-metrics.json"), physicalMetrics),
    writeJson(path.join(directory, "rejected-images.json"), completed.flatMap((item) => item.result.visionResults.filter((row) => row.result.subjectClass && row.result.subjectClass !== "EXACT_PRODUCT").map((row) => ({ targetField: item.targetField, imageUrl: row.imageUrl, subjectClass: row.result.subjectClass, reason: "SUBJECT_GATE_REJECTED" })))),
    writeJson(path.join(directory, "vision-results.json"), completed.flatMap((item) => item.result.visionResults.map((vision) => ({ targetField: item.targetField, ...vision })))),
    writeJson(path.join(directory, "evidence.json"), completed.flatMap((item) => item.result.state.evidence)),
    writeJson(path.join(directory, "claims.json"), claims),
    writeJson(path.join(directory, "conflicts.json"), conflicts),
    writeJson(path.join(directory, "rejected-hypotheses.json"), completed.flatMap((item) => item.result.state.rejectedHypotheses)),
    writeJson(path.join(directory, "resolution.json"), { status, resolutions, failures }),
    writeJson(path.join(directory, "cost.json"), costs),
    writeJson(path.join(directory, "source-candidates.json"), sourceCandidates),
    writeJson(path.join(directory, "provider-health.json"), completed.flatMap((item) => item.result.providerHealth.map((row) => ({ targetField: item.targetField, ...row })))),
    writeJson(path.join(directory, "retrieval-events.json"), completed.flatMap((item) => item.result.retrievalEvents.map((row) => ({ targetField: item.targetField, ...row })))),
    writeJson(path.join(directory, "fallback-events.json"), fallbackEvents),
    writeJson(path.join(directory, "technical-failures.json"), completed.flatMap((item) => item.result.technicalFailures.map((row) => ({ targetField: item.targetField, ...row })))),
    writeJson(path.join(directory, "retrieval-funnel.json"), completed.map((item) => ({ targetField: item.targetField, ...item.result.funnel }))),
    writeJson(path.join(directory, "catalog-immutability.json"), { identical: catalogMutations.length === 0, changed: [...new Set(catalogMutations)] }),
    writeJson(path.join(directory, "evidence-gaps.json"), completed.flatMap((item) => item.result.state.evidenceGaps ?? [])),
    writeJson(path.join(directory, "evidence-timeline.json"), evidenceTimeline),
    writeJson(path.join(directory, "repro.json"), { command: `npm run research:pilot:assassins-creed:${version} -- --case ${definition.number}`, researchOnly: true, sequential: true, freshSemanticRun: version === "v3" || version === "v4", targetFields: definition.targetFields }),
    writeFile(path.join(directory, "citations.md"), `# Citations\n\n${citationLines.length ? citationLines.join("\n") : "No citation-bearing evidence was accepted."}\n`, "utf8"),
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

async function writeClosure(pilotRoot: string, version: PilotVersion): Promise<Record<string, unknown>> {
  const preflight = await readJsonOrNull(path.join(pilotRoot, "preflight.json"));
  const rows = await Promise.all(PILOT_CASES.map(async (definition) => {
    const directory = caseDirectory(pilotRoot, definition, version);
    const resolution = await readJsonOrNull(path.join(directory, "resolution.json"));
    const cost = await readJsonOrNull(path.join(directory, "cost.json"));
    const claims = await readJsonOrNull(path.join(directory, "claims.json")) as unknown as Array<Record<string, unknown>> | null;
    const conflicts = await readJsonOrNull(path.join(directory, "conflicts.json")) as unknown as Array<Record<string, unknown>> | null;
    const technicalFailures = await readJsonOrNull(path.join(directory, "technical-failures.json")) as unknown as Array<Record<string, unknown>> | null;
    const queries = await readJsonOrNull(path.join(directory, "query-strategies.json")) as unknown as Array<Record<string, unknown>> | null;
    const evidence = await readJsonOrNull(path.join(directory, "evidence.json")) as unknown as Array<Record<string, unknown>> | null;
    const physicalMetrics = await readJsonOrNull(path.join(directory, "physical-metrics.json"));
    const pages = await readJsonOrNull(path.join(directory, "pages.json")) as unknown as Array<Record<string, unknown>> | null;
    const vision = await readJsonOrNull(path.join(directory, "vision-results.json")) as unknown as Array<Record<string, unknown>> | null;
    const bindings = await readJsonOrNull(path.join(directory, "identifier-bindings.json")) as unknown as Array<Record<string, unknown>> | null;
    const transitions = await readJsonOrNull(path.join(directory, "mode-transitions.json")) as unknown as Array<Record<string, unknown>> | null;
    return {
      definition, resolution, cost,
      claims: Array.isArray(claims) ? claims : [],
      conflicts: Array.isArray(conflicts) ? conflicts : [],
      technicalFailures: Array.isArray(technicalFailures) ? technicalFailures : [],
      queries: Array.isArray(queries) ? queries : [],
      evidence: Array.isArray(evidence) ? evidence : [],
      physicalMetrics: physicalMetrics ?? {},
      pages: Array.isArray(pages) ? pages : [],
      vision: Array.isArray(vision) ? vision : [],
      bindings: Array.isArray(bindings) ? bindings : [],
      transitions: Array.isArray(transitions) ? transitions : [],
    };
  }));
  const statuses = rows.map((row) => String(row.resolution?.status ?? "NOT_RUN"));
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const totalCost = rows.reduce((total, row) => {
    for (const key of ["searchCalls", "braveSearchCalls", "braveWebCalls", "braveImageCalls", "pagesOpened", "imagesInspected", "llmCalls", "visionCalls", "inputTokens", "outputTokens", "estimatedOpenAiCostUsd", "estimatedBraveCostUsd", "estimatedTotalCostUsd", "estimatedCostUsd", "durationMs"] as const) {
      total[key] += number(row.cost?.[key]);
    }
    return total;
  }, { searchCalls: 0, braveSearchCalls: 0, braveWebCalls: 0, braveImageCalls: 0, pagesOpened: 0, imagesInspected: 0, llmCalls: 0, visionCalls: 0, inputTokens: 0, outputTokens: 0, estimatedOpenAiCostUsd: 0, estimatedBraveCostUsd: 0, estimatedTotalCostUsd: 0, estimatedCostUsd: 0, durationMs: 0 });
  totalCost.estimatedCostUsd = Math.round(totalCost.estimatedCostUsd * 1_000_000) / 1_000_000;
  totalCost.estimatedOpenAiCostUsd = Math.round(totalCost.estimatedOpenAiCostUsd * 1_000_000) / 1_000_000;
  totalCost.estimatedBraveCostUsd = Math.round(totalCost.estimatedBraveCostUsd * 1_000_000) / 1_000_000;
  totalCost.estimatedTotalCostUsd = Math.round(totalCost.estimatedTotalCostUsd * 1_000_000) / 1_000_000;
  const unsafeFalsePositives = rows.flatMap((row) => row.claims).filter((claim) => claim.status === "VALIDATED" && Array.isArray(claim.validationErrors) && claim.validationErrors.length > 0).length;
  const crossAttributionErrors = rows.flatMap((row) => row.conflicts).filter((conflict) => String(conflict.reason).includes("CROSS_ATTRIBUTION") && String(conflict.severity) === "CRITICAL").length;
  const platformContaminationErrors = rows.flatMap((row) => row.claims).filter((claim) => claim.status === "VALIDATED" && Array.isArray(claim.validationErrors) && claim.validationErrors.some((error) => String(error).includes("PLATFORM"))).length;
  const catalogMutationDocuments = await Promise.all(PILOT_CASES.map((definition) => readJsonOrNull(path.join(caseDirectory(pilotRoot, definition, version), "catalog-immutability.json"))));
  const catalogMutations = catalogMutationDocuments.reduce((sum, document) => sum + (Array.isArray(document?.changed) ? document.changed.length : 0), 0);
  const recoveredTechnicalFailures = rows.flatMap((row) => row.technicalFailures).filter((failure) => failure.recovered === true).length;
  const unrecoveredTechnicalFailures = rows.flatMap((row) => row.technicalFailures).filter((failure) => failure.recovered !== true).length;
  const queryStrategies = rows.flatMap((row) => row.queries).reduce<Record<string, number>>((counts, query) => {
    const strategy = String(query.strategy ?? "UNKNOWN");
    counts[strategy] = (counts[strategy] ?? 0) + 1;
    return counts;
  }, {});
  const usefulPages = new Set(rows.flatMap((row) => row.evidence.map((evidence) => String(evidence.sourceUrl ?? "")).filter(Boolean))).size;
  const allVision = rows.flatMap((row) => row.vision);
  const visionResults = allVision.map((row) => (row.result && typeof row.result === "object" ? row.result : {}) as Record<string, unknown>);
  const components = visionResults.map((result) => String(result.component ?? "UNKNOWN_COMPONENT"));
  const subjectClasses = visionResults.map((result) => String(result.subjectClass ?? "UNREADABLE"));
  const allCandidates = rows.flatMap((row) => row.pages.flatMap((page) => Array.isArray(page.imageCandidates) ? page.imageCandidates as Array<Record<string, unknown>> : []));
  const inspectedUrls = new Set(allVision.map((row) => String(row.imageUrl ?? "")));
  const allBindings = rows.flatMap((row) => row.bindings);
  const componentBindingMetrics: Record<string, number> = {
    physicalEvidenceModeEntries: rows.flatMap((row) => row.transitions).filter((row) => row.to === "PHYSICAL_EVIDENCE_MODE").length,
    galleryPagesOpened: rows.flatMap((row) => row.pages).filter((row) => Array.isArray(row.imageCandidates) && row.imageCandidates.length > 0).length,
    imageCandidatesDiscovered: allCandidates.length,
    fullResolutionImagesFetched: allCandidates.filter((row) => row.originalUrl && inspectedUrls.has(String(row.originalUrl))).length,
    imagesClassified: allVision.length,
    exactTargetImages: subjectClasses.filter((value) => value === "EXACT_PRODUCT").length,
    wrongEditionImagesRejected: subjectClasses.filter((value) => value === "SAME_TITLE_DIFFERENT_EDITION").length,
    wrongPlatformImagesRejected: subjectClasses.filter((value) => value === "SAME_TITLE_DIFFERENT_PLATFORM").length,
    ambiguousImagesRejected: subjectClasses.filter((value) => !["EXACT_PRODUCT", "SAME_TITLE_DIFFERENT_EDITION", "SAME_TITLE_DIFFERENT_PLATFORM"].includes(value)).length,
    outerPackageImages: components.filter((value) => value.startsWith("OUTER_PACKAGE_")).length,
    innerCaseImages: components.filter((value) => value.startsWith("INNER_CASE_")).length,
    cartImages: components.filter((value) => value.startsWith("CARTRIDGE_")).length,
    discImages: components.filter((value) => value === "DISC").length,
    backCoverImages: components.filter((value) => value === "OUTER_PACKAGE_BACK" || value === "INNER_CASE_BACK").length,
    componentBoundClaims: rows.flatMap((row) => row.claims).filter((row) => row.component && !["UNKNOWN", "UNKNOWN_COMPONENT"].includes(String(row.component))).length,
    productBoundIdentifiers: allBindings.filter((row) => row.state === "PRODUCT_BOUND").length,
    unboundIdentifierCandidates: allBindings.filter((row) => row.state === "UNBOUND").length,
    sellerStickerIdentifiers: allBindings.filter((row) => row.component === "SELLER_STICKER" || row.component === "STICKER").length,
    marketBoundClaims: rows.flatMap((row) => row.evidence).filter((row) => row.marketBindingState === "MARKET_BOUND").length,
    wrongComponentRejected: allBindings.filter((row) => row.state === "REJECTED" && /component/i.test(String(row.rejectionReason ?? ""))).length,
  };
  const caseCostUsd = totalCost.estimatedTotalCostUsd;
  const preflightCostUsd = number(preflight?.estimatedBraveCostUsd);
  const confirmedTargets = rows.flatMap((row) => Array.isArray(row.resolution?.resolutions) ? row.resolution.resolutions as Array<Record<string, unknown>> : [])
    .filter((resolution) => resolution.status === "CONFIRMED").length;
  const summary = {
    cases: PILOT_CASES.length,
    completedCases: statuses.filter((status) => status !== "NOT_RUN").length,
    confirmed: statuses.filter((status) => status === "CONFIRMED").length,
    partial: statuses.filter((status) => status === "PARTIAL").length,
    unresolved: statuses.filter((status) => status === "UNRESOLVED").length,
    failed: statuses.filter((status) => status === "FAILED").length,
    blockedInfrastructure: statuses.filter((status) => status === "BLOCKED_INFRASTRUCTURE").length,
    notRun: statuses.filter((status) => status === "NOT_RUN").length,
    unsafeFalsePositives,
    crossAttributionErrors,
    platformContaminationErrors,
    ...totalCost,
    caseCostUsd,
    preflightCostUsd,
    estimatedTotalCostUsd: roundUsd(caseCostUsd + preflightCostUsd),
    catalogMutations,
    recoveredTechnicalFailures,
    unrecoveredTechnicalFailures,
    genericQueries: queryStrategies.GENERIC ?? 0,
    identifierQueries: queryStrategies.EXACT_IDENTIFIER ?? 0,
    sourceSpecificQueries: queryStrategies.SOURCE_SPECIFIC ?? 0,
    imageQueries: queryStrategies.IMAGE ?? 0,
    usefulPages,
    confirmedTargets,
    costPerConfirmedTargetUsd: confirmedTargets ? roundUsd((caseCostUsd + preflightCostUsd) / confirmedTargets) : null,
  };
  const retrievalPass = summary.completedCases === 5 && summary.failed === 0 && summary.blockedInfrastructure === 0 && summary.unrecoveredTechnicalFailures === 0;
  const functionalValidated = summary.failed === 0 && (summary.confirmed >= 2 || (summary.confirmed >= 1 && summary.partial >= 3));
  const positiveControlPass = statuses[0] === "CONFIRMED";
  const difficultConfirmed = statuses.slice(1).filter((status) => status === "CONFIRMED").length;
  const qualifyingDifficultPartials = rows.slice(1).filter((row, index) => {
    if (statuses[index + 1] !== "PARTIAL") return false;
    const boundIdentifier = row.bindings.some((binding) => binding.state === "COMPONENT_BOUND" || binding.state === "PRODUCT_BOUND");
    const boundValidatedClaim = row.claims.some((claim) => claim.status === "VALIDATED" && claim.component && !["UNKNOWN", "UNKNOWN_COMPONENT"].includes(String(claim.component)));
    return boundIdentifier || boundValidatedClaim;
  }).length;
  const physicalEvidenceBindingPass = retrievalPass
    && summary.unsafeFalsePositives === 0 && summary.crossAttributionErrors === 0 && summary.platformContaminationErrors === 0 && summary.catalogMutations === 0
    && componentBindingMetrics.physicalEvidenceModeEntries > 0 && componentBindingMetrics.galleryPagesOpened > 0
    && componentBindingMetrics.fullResolutionImagesFetched > 0 && componentBindingMetrics.exactTargetImages > 0
    && componentBindingMetrics.productBoundIdentifiers > 0;
  const developmentPilotQualityPass = positiveControlPass
    && (difficultConfirmed >= 2 || (difficultConfirmed >= 1 && qualifyingDifficultPartials >= 2));
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
    `- Blocked infrastructure: ${summary.blockedInfrastructure}`,
    `- Retrieval pass: ${retrievalPass ? "PASS" : "FAIL"}`,
    `- Physical evidence binding: ${physicalEvidenceBindingPass ? "PASS" : "FAIL"}`,
    `- Development pilot research quality: ${developmentPilotQualityPass ? "PASS" : "FAIL"}`,
    "- Generalized autonomous research: NOT YET HOLDOUT VALIDATED",
    `- Functional validation: ${functionalValidated ? "PASS" : "FAIL"}`,
    `- Unsafe false positives: ${summary.unsafeFalsePositives}`,
    `- Cross-attribution errors accepted: ${summary.crossAttributionErrors}`,
    `- Platform contamination errors accepted: ${summary.platformContaminationErrors}`,
    `- Search calls: ${summary.searchCalls}`,
    `- Generic queries: ${summary.genericQueries}`,
    `- Exact-identifier queries: ${summary.identifierQueries}`,
    `- Source-specific queries: ${summary.sourceSpecificQueries}`,
    `- Image queries: ${summary.imageQueries}`,
    `- Brave web calls: ${summary.braveWebCalls}`,
    `- Brave image calls: ${summary.braveImageCalls}`,
    `- Pages: ${summary.pagesOpened}`,
    `- Images: ${summary.imagesInspected}`,
    `- LLM calls: ${summary.llmCalls}`,
    `- Vision calls: ${summary.visionCalls}`,
    `- Input tokens: ${summary.inputTokens}`,
    `- Output tokens: ${summary.outputTokens}`,
    `- Estimated OpenAI cost: $${summary.estimatedOpenAiCostUsd.toFixed(6)}`,
    `- Estimated Brave cost: $${summary.estimatedBraveCostUsd.toFixed(6)}`,
    `- Preflight cost: $${summary.preflightCostUsd.toFixed(6)}`,
    `- Case cost: $${summary.caseCostUsd.toFixed(6)}`,
    `- Estimated total cost: $${summary.estimatedTotalCostUsd.toFixed(6)}`,
    `- Cost per confirmed target: ${summary.costPerConfirmedTargetUsd === null ? "N/A" : `$${summary.costPerConfirmedTargetUsd.toFixed(6)}`}`,
    `- Technical failures recovered: ${summary.recoveredTechnicalFailures}`,
    `- Technical failures unrecovered: ${summary.unrecoveredTechnicalFailures}`,
    `- Duration: ${summary.durationMs} ms`,
    `- Catalog mutations: ${summary.catalogMutations}`,
  ].join("\n");
  await mkdir(pilotRoot, { recursive: true });
  await writeFile(path.join(pilotRoot, "closure.md"), `${markdown}\n`, "utf8");
  await writeJson(path.join(pilotRoot, "component-binding-metrics.json"), componentBindingMetrics);
  if (version === "v4") {
    const pilot3 = await readJsonOrNull(path.join(researchArtifactRoot(), "pilot-assassins-creed-v3", "before-after-comparison.json"));
    await writeJson(path.join(pilotRoot, "cost-comparison.json"), {
      pilot3: pilot3?.pilot3 ?? null,
      pilot4: summary,
      verdicts: { retrievalPass, physicalEvidenceBindingPass, developmentPilotQualityPass, generalizedAutonomousResearch: "NOT_YET_HOLDOUT_VALIDATED" },
      deltaUsd: roundUsd(summary.estimatedTotalCostUsd - number((pilot3?.pilot3 as Record<string, unknown> | undefined)?.estimatedTotalCostUsd)),
      note: "Pilot 3 is used only as an evaluation baseline; no prior answer is supplied to runtime.",
    });
  }
  await writeJson(path.join(pilotRoot, "before-after-comparison.json"), {
    pilot1: { confirmed: 0, partial: 0, unresolved: 1, failed: 4, searches: 52, pages: 13, images: 4, estimatedCostUsd: 0.019041 },
    [version === "v4" ? "pilot4" : version === "v3" ? "pilot3" : "pilot2"]: summary,
    retrievalPass,
    functionalValidated,
    physicalEvidenceBindingPass,
    developmentPilotQualityPass,
    generalizedAutonomousResearch: "NOT_YET_HOLDOUT_VALIDATED",
  });
  return { ...summary, retrievalPass, functionalValidated, physicalEvidenceBindingPass, developmentPilotQualityPass, generalizedAutonomousResearch: "NOT_YET_HOLDOUT_VALIDATED" };
}

async function writePilotBaseline(pilotRoot: string): Promise<void> {
  await mkdir(pilotRoot, { recursive: true });
  await writeFile(path.join(pilotRoot, "pilot1-root-cause.md"), [
    "# Pilot 1 root-cause analysis",
    "",
    "- Outcome: 0 CONFIRMED, 0 PARTIAL, 1 UNRESOLVED, 4 FAILED.",
    "- Funnel: 52 searches, 13 pages opened and 4 images inspected.",
    "- Cost: $0.019041.",
    "- Safety: 0 catalog mutations, 0 accepted unsafe false positives, 0 accepted cross-attribution errors and 0 accepted platform-contamination errors.",
    "- Primary root cause: retrieval infrastructure exceptions escaped the search/image layers and were interpreted as semantic case failures.",
    "- Contributing causes: a single usable general provider, quota exhaustion opening no circuit, limited source-aware direct routing, shallow page-image extraction and shared accounting of technical failures with semantic progress.",
    "- Corrective status: covered by typed retrieval failures, quota circuit breaker, bounded retry/failover, direct URL routing, richer image discovery, separate technical telemetry and BLOCKED_INFRASTRUCTURE terminal state.",
  ].join("\n") + "\n", "utf8");
  await writeJson(path.join(pilotRoot, "pilot1-baseline.json"), {
    confirmed: 0, partial: 0, unresolved: 1, failed: 4,
    searches: 52, pages: 13, images: 4, estimatedCostUsd: 0.019041,
    catalogMutations: 0, unsafeFalsePositives: 0, crossAttributionErrors: 0, platformContaminationErrors: 0,
  });
}

async function caseComparisonMetrics(root: string, definition: PilotCase, version: PilotVersion) {
  const directory = caseDirectory(root, definition, version);
  const resolution = await readJsonOrNull(path.join(directory, "resolution.json"));
  const cost = await readJsonOrNull(path.join(directory, "cost.json"));
  const rawQueries = await readJsonOrNull(path.join(directory, version === "v3" || version === "v4" ? "query-strategies.json" : "queries.json")) as unknown as Array<Record<string, unknown>> | null;
  const pages = await readJsonOrNull(path.join(directory, "pages.json")) as unknown as Array<Record<string, unknown>> | null;
  const evidence = await readJsonOrNull(path.join(directory, "evidence.json")) as unknown as Array<Record<string, unknown>> | null;
  const vision = await readJsonOrNull(path.join(directory, "vision-results.json")) as unknown as Array<Record<string, unknown>> | null;
  const claims = await readJsonOrNull(path.join(directory, "claims.json")) as unknown as Array<Record<string, unknown>> | null;
  const queries = Array.isArray(rawQueries) ? rawQueries : [];
  const exact = queries.filter((row) => row.strategy === "EXACT_IDENTIFIER" || /(?:^|[\s\"])(?:\d{12,13}|(?:NTR|TWL|WUP|HAC|TSA-HAC|LA-H)-[A-Z0-9-]+)(?:$|[\s\"])/i.test(String(row.query ?? ""))).length;
  const sourceSpecific = queries.filter((row) => row.strategy === "SOURCE_SPECIFIC"
    || (version === "v2" && !/(?:^|[\s\"])(?:\d{12,13}|(?:NTR|TWL|WUP|HAC|TSA-HAC|LA-H)-[A-Z0-9-]+)(?:$|[\s\"])/i.test(String(row.query ?? "")) && /^site:/i.test(String(row.query ?? "")))).length;
  const image = Number(cost?.braveImageCalls ?? 0);
  const generic = version === "v3" || version === "v4"
    ? queries.filter((row) => row.strategy === "GENERIC").length
    : Math.max(0, queries.length - exact - sourceSpecific - image);
  const evidenceRows = Array.isArray(evidence) ? evidence : [];
  const claimRows = Array.isArray(claims) ? claims : [];
  return {
    status: String(resolution?.status ?? "NOT_RUN"),
    generic,
    exact,
    sourceSpecific,
    image,
    pages: Array.isArray(pages) ? pages.length : 0,
    usefulPages: new Set(evidenceRows.map((row) => String(row.sourceUrl ?? "")).filter(Boolean)).size,
    imagesInspected: Array.isArray(vision) ? vision.length : 0,
    confirmedClaims: claimRows.filter((row) => row.status === "VALIDATED").length,
    candidateClaims: claimRows.filter((row) => row.status === "CANDIDATE").length,
    cost: Number(cost?.estimatedTotalCostUsd ?? cost?.estimatedCostUsd ?? 0),
  };
}

async function writePilot3Comparison(pilot3Root: string): Promise<void> {
  const pilot2Root = path.join(researchArtifactRoot(), "pilot-assassins-creed-v2");
  const rows = await Promise.all(PILOT_CASES.map(async (definition) => ({
    definition,
    pilot2: await caseComparisonMetrics(pilot2Root, definition, "v2"),
    pilot3: await caseComparisonMetrics(pilot3Root, definition, "v3"),
  })));
  const header = "| Case | Pilot 2 | Pilot 3 | Generic P2→P3 | Identifier P2→P3 | Source P2→P3 | Image P2→P3 | Pages P2→P3 | Useful pages P2→P3 | Images inspected P2→P3 | Confirmed claims P2→P3 | Candidate claims P2→P3 | Cost P2→P3 | Reason for change |";
  const divider = "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|";
  const lines = rows.map(({ definition, pilot2, pilot3 }) => {
    const reason = pilot2.status === pilot3.status
      ? "Status unchanged; compare evidence gaps for the remaining barrier."
      : `Routing/evidence changed status from ${pilot2.status} to ${pilot3.status}.`;
    return `| ${definition.number}. ${definition.title} | ${pilot2.status} | ${pilot3.status} | ${pilot2.generic}→${pilot3.generic} | ${pilot2.exact}→${pilot3.exact} | ${pilot2.sourceSpecific}→${pilot3.sourceSpecific} | ${pilot2.image}→${pilot3.image} | ${pilot2.pages}→${pilot3.pages} | ${pilot2.usefulPages}→${pilot3.usefulPages} | ${pilot2.imagesInspected}→${pilot3.imagesInspected} | ${pilot2.confirmedClaims}→${pilot3.confirmedClaims} | ${pilot2.candidateClaims}→${pilot3.candidateClaims} | $${pilot2.cost.toFixed(6)}→$${pilot3.cost.toFixed(6)} | ${reason} |`;
  });
  await writeFile(path.join(pilot3Root, "comparison-pilot2-vs-pilot3.md"), [
    "# Pilot 2 vs Pilot 3",
    "",
    header,
    divider,
    ...lines,
    "",
    "Pilot 3 is a fresh semantic run. Pilot 1/2 artifacts were used only for root-cause analysis and comparison, never as an answer source.",
    "",
  ].join("\n"), "utf8");
}

async function writePilot4Comparison(pilot4Root: string): Promise<void> {
  const pilot3Root = path.join(researchArtifactRoot(), "pilot-assassins-creed-v3");
  const officialPilot3ByCase: Record<number, Awaited<ReturnType<typeof caseComparisonMetrics>>> = {
    1: { status: "CONFIRMED", generic: 0, exact: 8, sourceSpecific: 6, image: 0, pages: 9, usefulPages: 9, imagesInspected: 0, confirmedClaims: 2, candidateClaims: 0, cost: 0.073185 },
    2: { status: "UNRESOLVED", generic: 0, exact: 11, sourceSpecific: 6, image: 3, pages: 2, usefulPages: 5, imagesInspected: 4, confirmedClaims: 0, candidateClaims: 0, cost: 0.107597 },
    3: { status: "UNRESOLVED", generic: 9, exact: 0, sourceSpecific: 9, image: 2, pages: 0, usefulPages: 2, imagesInspected: 2, confirmedClaims: 0, candidateClaims: 0, cost: 0.104676 },
    4: { status: "UNRESOLVED", generic: 0, exact: 0, sourceSpecific: 18, image: 2, pages: 8, usefulPages: 7, imagesInspected: 3, confirmedClaims: 0, candidateClaims: 0, cost: 0.107811 },
    5: { status: "UNRESOLVED", generic: 0, exact: 12, sourceSpecific: 0, image: 1, pages: 8, usefulPages: 5, imagesInspected: 0, confirmedClaims: 0, candidateClaims: 0, cost: 0.067661 },
  };
  const rows = await Promise.all(PILOT_CASES.map(async (definition) => ({
    definition,
    pilot3: await caseComparisonMetrics(pilot3Root, definition, "v3").then((metrics) => metrics.status === "NOT_RUN" ? officialPilot3ByCase[definition.number] : metrics),
    pilot4: await caseComparisonMetrics(pilot4Root, definition, "v4"),
  })));
  const header = "| Case | Pilot 3 | Pilot 4 | Generic P3→P4 | Identifier P3→P4 | Source P3→P4 | Image P3→P4 | Pages P3→P4 | Images inspected P3→P4 | Cost P3→P4 |";
  const divider = "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const lines = rows.map(({ definition, pilot3, pilot4 }) => `| ${definition.number}. ${definition.title} | ${pilot3.status} | ${pilot4.status} | ${pilot3.generic}→${pilot4.generic} | ${pilot3.exact}→${pilot4.exact} | ${pilot3.sourceSpecific}→${pilot4.sourceSpecific} | ${pilot3.image}→${pilot4.image} | ${pilot3.pages}→${pilot4.pages} | ${pilot3.imagesInspected}→${pilot4.imagesInspected} | $${pilot3.cost.toFixed(6)}→$${pilot4.cost.toFixed(6)} |`);
  const pilot3Document = await readJsonOrNull(path.join(pilot3Root, "before-after-comparison.json"));
  const pilot4Document = await readJsonOrNull(path.join(pilot4Root, "before-after-comparison.json"));
  const bindings = await readJsonOrNull(path.join(pilot4Root, "component-binding-metrics.json"));
  const pilot3 = (pilot3Document?.pilot3 ?? {}) as Record<string, unknown>;
  const pilot4 = (pilot4Document?.pilot4 ?? {}) as Record<string, unknown>;
  const value = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0);
  const global = [
    "## Global metrics",
    "",
    "| Metric | Pilot 3 | Pilot 4 |",
    "|---|---:|---:|",
    `| CONFIRMED | ${value(pilot3, "confirmed")} | ${value(pilot4, "confirmed")} |`,
    `| PARTIAL | ${value(pilot3, "partial")} | ${value(pilot4, "partial")} |`,
    `| UNRESOLVED | ${value(pilot3, "unresolved")} | ${value(pilot4, "unresolved")} |`,
    `| FAILED | ${value(pilot3, "failed")} | ${value(pilot4, "failed")} |`,
    `| BLOCKED | ${value(pilot3, "blockedInfrastructure")} | ${value(pilot4, "blockedInfrastructure")} |`,
    `| Web searches | ${value(pilot3, "braveWebCalls")} | ${value(pilot4, "braveWebCalls")} |`,
    `| Identifier searches | ${value(pilot3, "identifierQueries")} | ${value(pilot4, "identifierQueries")} |`,
    `| Source searches | ${value(pilot3, "sourceSpecificQueries")} | ${value(pilot4, "sourceSpecificQueries")} |`,
    `| Image searches | ${value(pilot3, "imageQueries")} | ${value(pilot4, "imageQueries")} |`,
    `| Pages | ${value(pilot3, "pagesOpened")} | ${value(pilot4, "pagesOpened")} |`,
    `| Images inspected | ${value(pilot3, "imagesInspected")} | ${value(pilot4, "imagesInspected")} |`,
    `| Technical failures recovered | ${value(pilot3, "recoveredTechnicalFailures")} | ${value(pilot4, "recoveredTechnicalFailures")} |`,
    `| Technical failures unrecovered | ${value(pilot3, "unrecoveredTechnicalFailures")} | ${value(pilot4, "unrecoveredTechnicalFailures")} |`,
    `| Brave cost | $${value(pilot3, "estimatedBraveCostUsd").toFixed(6)} | $${value(pilot4, "estimatedBraveCostUsd").toFixed(6)} |`,
    `| OpenAI cost | $${value(pilot3, "estimatedOpenAiCostUsd").toFixed(6)} | $${value(pilot4, "estimatedOpenAiCostUsd").toFixed(6)} |`,
    `| Total cost | $${value(pilot3, "estimatedTotalCostUsd").toFixed(6)} | $${value(pilot4, "estimatedTotalCostUsd").toFixed(6)} |`,
    "",
    "Pilot 4 physical-only metrics:",
    "",
    `- Gallery pages: ${Number(bindings?.galleryPagesOpened ?? 0)}`,
    `- Images discovered: ${Number(bindings?.imageCandidatesDiscovered ?? 0)}`,
    `- Full-resolution images fetched: ${Number(bindings?.fullResolutionImagesFetched ?? 0)}`,
    `- Component-bound claims: ${Number(bindings?.componentBoundClaims ?? 0)}`,
    `- Product-bound identifiers: ${Number(bindings?.productBoundIdentifiers ?? 0)}`,
    `- Unbound candidates: ${Number(bindings?.unboundIdentifierCandidates ?? 0)}`,
    `- Wrong-edition images rejected: ${Number(bindings?.wrongEditionImagesRejected ?? 0)}`,
    `- Wrong-platform images rejected: ${Number(bindings?.wrongPlatformImagesRejected ?? 0)}`,
    `- Wrong-component identifiers rejected: ${Number(bindings?.wrongComponentRejected ?? 0)}`,
    "",
  ];
  await writeFile(path.join(pilot4Root, "comparison-pilot3-vs-pilot4.md"), ["# Pilot 3 vs Pilot 4", "", header, divider, ...lines, "", ...global, "Pilot 3 metrics come from the committed official comparison report when per-case artifacts are unavailable. This baseline is used only for evaluation.", "Pilot 4 uses a fresh semantic namespace and does not import prior answers.", ""].join("\n"), "utf8");
}

async function writePilot4Gate1(pilotRoot: string): Promise<{ pass: boolean; classification: string }> {
  const definition = PILOT_CASES[1];
  const directory = caseDirectory(pilotRoot, definition, "v4");
  const resolution = await readJsonOrNull(path.join(directory, "resolution.json"));
  const candidates = await readJsonOrNull(path.join(directory, "image-candidates.json")) as unknown as Array<Record<string, unknown>> | null;
  const vision = await readJsonOrNull(path.join(directory, "vision-results.json")) as unknown as Array<Record<string, unknown>> | null;
  const bindings = await readJsonOrNull(path.join(directory, "identifier-bindings.json")) as unknown as Array<Record<string, unknown>> | null;
  const metrics = await readJsonOrNull(path.join(directory, "physical-metrics.json"));
  const failures = await readJsonOrNull(path.join(directory, "technical-failures.json")) as unknown as Array<Record<string, unknown>> | null;
  const status = String(resolution?.status ?? "NOT_RUN");
  const candidateCount = Array.isArray(candidates) ? candidates.length : 0;
  const visionCount = Array.isArray(vision) ? vision.length : 0;
  const bindingCount = Array.isArray(bindings) ? bindings.length : 0;
  const eligibleBindingCount = Array.isArray(bindings) ? bindings.filter((row) => row.state === "COMPONENT_BOUND" || row.state === "PRODUCT_BOUND").length : 0;
  const unrecovered = Array.isArray(failures) ? failures.filter((row) => row.recovered !== true).length : 0;
  const subjectAccepted = Number(metrics?.subjectAccepted ?? 0);
  const componentAccepted = Number(metrics?.componentAccepted ?? 0);
  const pass = unrecovered === 0 && (status === "CONFIRMED" || (status === "PARTIAL" && eligibleBindingCount > 0));
  const classification = pass ? "PHYSICAL_PIPELINE_DEMONSTRATED"
    : unrecovered > 0 ? "TECHNICAL_RETRIEVAL_FAILURE"
      : candidateCount === 0 ? "SOURCE_DISCOVERY_FAILURE"
        : visionCount === 0 ? "GALLERY_ACQUISITION_OR_RANKING_FAILURE"
          : subjectAccepted === 0 ? "SUBJECT_CLASSIFICATION_FAILURE"
            : componentAccepted === 0 ? "COMPONENT_CLASSIFICATION_FAILURE"
              : eligibleBindingCount === 0 ? "IDENTIFIER_READ_OR_PRODUCT_BINDING_FAILURE" : "EVIDENCE_AVAILABILITY_GAP";
  await writeJson(path.join(pilotRoot, "gate-1-result.json"), { case: definition.number, status, pass, classification, candidateCount, visionCount, bindingCount, eligibleBindingCount, subjectAccepted, componentAccepted, unrecoveredTechnicalFailures: unrecovered });
  return { pass, classification };
}

async function ensurePilot4CaseArtifacts(pilotRoot: string): Promise<void> {
  for (const definition of PILOT_CASES) {
    const directory = caseDirectory(pilotRoot, definition, "v4");
    const pages = await readJsonOrNull(path.join(directory, "pages.json")) as unknown as Array<Record<string, unknown>> | null;
    if (!Array.isArray(pages)) continue;
    const vision = await readJsonOrNull(path.join(directory, "vision-results.json")) as unknown as Array<Record<string, unknown>> | null;
    const bindings = await readJsonOrNull(path.join(directory, "identifier-bindings.json")) as unknown as Array<Record<string, unknown>> | null;
    const retrievalEvents = await readJsonOrNull(path.join(directory, "retrieval-events.json")) as unknown as Array<Record<string, unknown>> | null;
    const evidence = await readJsonOrNull(path.join(directory, "evidence.json")) as unknown as Array<Record<string, unknown>> | null;
    const imageCandidates = pages.flatMap((page) => Array.isArray(page.imageCandidates) ? page.imageCandidates as Array<Record<string, unknown>> : []);
    const sourcePages = pages.map((page) => {
      const { imageCandidates: pageImages, ...sourcePage } = page;
      return { ...sourcePage, imageCandidateCount: Array.isArray(pageImages) ? pageImages.length : 0 };
    });
    const visionRows = Array.isArray(vision) ? vision : [];
    const bindingRows = Array.isArray(bindings) ? bindings : [];
    const evidenceImages = (Array.isArray(evidence) ? evidence : []).filter((row) => row.imageUrl).map((row) => {
      const matchingVision = visionRows.find((visionRow) => visionRow.imageUrl === row.imageUrl);
      const result = (matchingVision?.result && typeof matchingVision.result === "object" ? matchingVision.result : {}) as Record<string, unknown>;
      return {
        evidenceId: row.id, sourcePageUrl: row.sourcePageUrl ?? row.canonicalUrl, originalUrl: row.originalImageUrl ?? row.imageUrl,
        resolvedUrl: row.resolvedImageUrl ?? row.imageUrl, contentHash: row.imageHash, sourceId: row.sourceId,
        sourceRecordId: row.sourceRecordId ?? null, listingId: row.listingId ?? null,
        subjectClass: row.subjectClass ?? result.subjectClass ?? "UNREADABLE", platformClassification: row.platformClassification ?? result.platformCandidate ?? null,
        editionClassification: row.editionClassification ?? result.editionCandidate ?? null, editionClass: row.editionClass ?? result.editionClass ?? "UNKNOWN",
        visibleEditionMarker: row.visibleEditionMarker ?? result.visibleEditionMarker ?? null, component: row.component ?? result.component ?? "UNKNOWN_COMPONENT",
        marketBindingState: row.marketBindingState ?? result.marketBindingState ?? "UNBOUND", marketEvidence: row.marketEvidence ?? result.distributorText ?? [],
        languageEvidence: row.languageEvidence ?? result.packagingLanguagesObserved ?? [],
        extractedIdentifiers: row.extractedIdentifiers ?? [
          ...(Array.isArray(result.barcodeCandidates) ? result.barcodeCandidates.map((value) => ({ type: "BARCODE", value })) : []),
          ...(Array.isArray(result.printedCodes) ? result.printedCodes.map((value) => ({ type: "PRINTED_CODE", value })) : []),
        ],
        bindingState: row.bindingState ?? result.bindingState ?? "UNBOUND", productNodeId: row.productNodeId ?? null, componentNodeId: row.componentNodeId ?? null,
        model: row.visionModel ?? (matchingVision?.usage as Record<string, unknown> | undefined)?.model ?? null, schemaVersion: row.visionSchemaVersion ?? 1,
      };
    });
    await Promise.all([
      writeJson(path.join(directory, "source-pages.json"), sourcePages),
      writeJson(path.join(directory, "gallery-pages.json"), sourcePages.filter((page) => Number(page.imageCandidateCount) > 0)),
      writeJson(path.join(directory, "image-resolution.json"), imageCandidates.map((candidate) => ({
        sourcePageUrl: candidate.sourcePageUrl, thumbnailUrl: candidate.thumbnailUrl, originalUrl: candidate.originalUrl,
        resolvedUrl: candidate.resolvedUrl, canonicalUrl: candidate.canonicalUrl, acquisitionMechanisms: candidate.acquisitionMechanisms,
      }))),
      writeJson(path.join(directory, "evidence-images.json"), evidenceImages),
      writeJson(path.join(directory, "subject-classification.json"), visionRows.map((row) => {
        const result = (row.result && typeof row.result === "object" ? row.result : {}) as Record<string, unknown>;
        return { targetField: row.targetField, imageUrl: row.imageUrl, subjectClass: result.subjectClass ?? "UNREADABLE", editionClass: result.editionClass ?? "UNKNOWN", visibleEditionMarker: result.visibleEditionMarker ?? null, stage: (result.visualStages as Record<string, unknown> | undefined)?.subject ?? "UNREADABLE" };
      })),
      writeJson(path.join(directory, "component-classification.json"), visionRows.map((row) => {
        const result = (row.result && typeof row.result === "object" ? row.result : {}) as Record<string, unknown>;
        return { targetField: row.targetField, imageUrl: row.imageUrl, component: result.component ?? "UNKNOWN_COMPONENT", stage: (result.visualStages as Record<string, unknown> | undefined)?.component ?? "UNREADABLE" };
      })),
      writeJson(path.join(directory, "vision-extractions.json"), visionRows),
      writeJson(path.join(directory, "identifier-candidates.json"), bindingRows.filter((row) => row.state !== "REJECTED")),
      writeJson(path.join(directory, "rejected-identifiers.json"), bindingRows.filter((row) => row.state === "REJECTED")),
      writeJson(path.join(directory, "fallback-events.json"), (Array.isArray(retrievalEvents) ? retrievalEvents : []).filter((row) => row.outcome === "RETRY" || row.outcome === "FAILOVER" || row.outcome === "OPEN_CIRCUIT")),
    ]);
  }
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const pilotRoot = path.join(researchArtifactRoot(), `pilot-assassins-creed-${args.version}`);
  if (args.version === "v4" && process.argv.includes("--all")) {
    const gate = await readJsonOrNull(path.join(pilotRoot, "gate-1-result.json"));
    if (gate?.pass !== true) throw new Error("PILOT4_GATE1_NOT_PASSED");
  }
  if (args.version === "v2") await writePilotBaseline(pilotRoot);
  if (!args.reportOnly) {
    assertResearchEngineEnabled();
    const capabilities = researchRuntimeCapabilities();
    if (!capabilities.openai) throw new Error("OPENAI_NOT_CONFIGURED");
    if (!capabilities.braveSearch) {
      const checkedAt = new Date().toISOString();
      const preflight = {
        status: "PRECHECK_BLOCKED",
        checkedAt,
        checks: {
          brave: { ok: false, detail: "NOT_CONFIGURED" },
          google: { ok: true, detail: capabilities.googleSearch ? "CONFIGURED / NOT_PROBED" : "NOT_CONFIGURED" },
          serpApi: { ok: true, detail: capabilities.serpApi ? "CONFIGURED / NOT_PROBED" : "NOT_CONFIGURED" },
          browser: { ok: false, detail: "NOT_RUN" },
          vision: { ok: false, detail: "NOT_RUN" },
          localStorage: { ok: false, detail: "NOT_RUN" },
        },
        providerHealth: [{ provider: "brave-search", state: "NOT_CONFIGURED", checkedAt, failureCode: null, detail: "BRAVE_SEARCH_API_KEY is missing." }],
        providerUsage: {},
        braveSearchCalls: 0,
        estimatedBraveCostUsd: 0,
      } satisfies Record<string, unknown>;
      await writeJson(path.join(pilotRoot, "preflight.json"), preflight);
      await writeFile(path.join(pilotRoot, "closure.md"), "# Assassin's Creed research pilot 2\n\n- Status: PRECHECK BLOCKED\n- Blocker: BRAVE_SEARCH_API_KEY is not configured.\n- Pilot cases started: 0\n- Brave calls: 0\n- Catalog mutations: 0\n- Retrieval pass: not achieved\n- Functional validation: not run\n", "utf8");
      await writeJson(path.join(pilotRoot, "before-after-comparison.json"), {
        pilot1: { confirmed: 0, partial: 0, unresolved: 1, failed: 4, searches: 52, pages: 13, images: 4, estimatedCostUsd: 0.019041 },
        pilot2: { status: "PRECHECK_BLOCKED", blocker: "BRAVE_SEARCH_NOT_CONFIGURED", casesStarted: 0, braveSearchCalls: 0, catalogMutations: 0 },
        retrievalPass: false,
        functionalValidated: false,
      });
      console.log(JSON.stringify(preflight, null, 2));
      return;
    }
    const store = new ResearchRunStore();
    const preflight = await runPreflight(pilotRoot, store, args.version);
    if (preflight.status !== "READY") {
      await writeFile(path.join(pilotRoot, "closure.md"), "# Assassin's Creed research pilot 2\n\n- Status: PRECHECK BLOCKED\n- Blocker: Brave, browser, vision or storage preflight is not READY.\n- Google Custom Search: non-blocking\n- SerpAPI: non-blocking\n- Pilot cases started: 0\n- Catalog mutations: 0\n- Retrieval pass: not achieved\n- Functional validation: not run\n", "utf8");
      await writeJson(path.join(pilotRoot, "before-after-comparison.json"), {
        pilot1: { confirmed: 0, partial: 0, unresolved: 1, failed: 4, searches: 52, pages: 13, images: 4, estimatedCostUsd: 0.019041 },
        pilot2: { status: "PRECHECK_BLOCKED", casesStarted: 0, catalogMutations: 0 },
        retrievalPass: false,
        functionalValidated: false,
      });
      console.log(JSON.stringify(preflight, null, 2));
      return;
    }
    for (const definition of args.cases) {
      // The documented Pilot 2 ceilings are case-wide: targets within one case
      // share them, while --all gives each of the five independent cases the
      // same bounded opportunity to resolve.
      const pilotBudget: PilotBudget = {
        remainingSearches: numericEnv("RESEARCH_PILOT_MAX_SEARCHES", 20),
        remainingPages: numericEnv("RESEARCH_PILOT_MAX_PAGES", args.version === "v4" ? 25 : 25),
        remainingImages: numericEnv("RESEARCH_PILOT_MAX_IMAGES", args.version === "v4" ? 30 : 15),
        remainingAgentTurns: numericEnv("RESEARCH_PILOT_MAX_AGENT_TURNS", args.version === "v4" ? 14 : 10),
        remainingBrowserSessions: numericEnv("RESEARCH_PILOT_MAX_BROWSER_SESSIONS", args.version === "v4" ? 8 : 5),
        remainingTokens: numericEnv("RESEARCH_PILOT_MAX_TOKENS", args.version === "v4" ? 80_000 : 60_000),
        remainingUsd: numericEnv("RESEARCH_PILOT_MAX_COST_USD", args.version === "v4" ? 0.25 : 0.20),
      };
      await runCase(definition, pilotRoot, store, pilotBudget, args.version);
    }
  }
  const closure = await writeClosure(pilotRoot, args.version);
  if (args.version === "v3") await writePilot3Comparison(pilotRoot);
  if (args.version === "v4") {
    await ensurePilot4CaseArtifacts(pilotRoot);
    if (args.cases.some((row) => row.number === 2)) await writePilot4Gate1(pilotRoot);
    await writePilot4Comparison(pilotRoot);
  }
  console.log(JSON.stringify(closure, null, 2));
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
