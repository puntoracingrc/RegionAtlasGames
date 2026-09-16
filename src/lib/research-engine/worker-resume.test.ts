import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getResearchSubjectById } from "./catalog-context";
import { createResearchState, durableTask, ResearchRunStore } from "./state-store";
import type { ResearchSubject } from "./types";
import type {
  ResearchLlmProvider,
  ResearchPageFetcher,
  ResearchSearchProviderV2,
} from "./v2-types";
import { runResearchTaskV2 } from "./worker";

const subject: ResearchSubject = {
  id: "pilot:n64-resume-test",
  kind: "related-release",
  catalogId: null,
  guideId: null,
  physicalEditionId: null,
  title: "Test Adventure",
  platformSlug: "n64",
  edition: "Standard",
  region: "Europe",
  barcode: null,
  productCodes: [],
  serials: [],
  marketRegions: [],
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
  notes: [],
};

class SearchMock implements ResearchSearchProviderV2 {
  readonly name = "mock-search";
  readonly requests: string[] = [];
  calls = 0;

  constructor(private readonly prefix: string) {}

  async search(request: Parameters<ResearchSearchProviderV2["search"]>[0]) {
    this.requests.push(request.query);
    this.calls += 1;
    return [{
      title: "Exact N64 box record",
      url: `https://www.nintendo64ever.com/${this.prefix}-${this.calls}`,
      snippet: "Component codes for Test Adventure",
      host: "www.nintendo64ever.com",
      rank: 1,
      publishedAt: null,
      provider: this.name,
    }];
  }

  getUsage() {
    return { [this.name]: this.calls };
  }
}

const pageFetcher: ResearchPageFetcher = {
  async fetch(url) {
    return {
      requestedUrl: url,
      canonicalUrl: url,
      status: 200,
      title: "Test Adventure physical record",
      text: "Test Adventure Nintendo 64 Standard. Cartridge code NUS-TEST-EUR. Box code NUS-P-TEST-EUR.",
      language: "en",
      structuredData: [],
      links: [],
      imageCandidates: [],
      fetchedAt: "2026-09-16T00:00:00Z",
      contentType: "text/html",
      bytes: 100,
    };
  },
};

const modelUsage = { provider: "openai" as const, model: "mock-cheap", calls: 1, inputTokens: 100, outputTokens: 25, estimatedCostUsd: 0.0001 };

const llmProvider: ResearchLlmProvider = {
  name: "mock-llm",
  async extract() {
    return {
      claims: [{ field: "BOX_CODE" as const, value: "NUS-P-TEST-EUR", confidence: 0.9, excerpt: "Box code NUS-P-TEST-EUR", component: "BOX_FLAPS" as const }],
      identifiers: [{ type: "PRODUCT_CODE", value: "NUS-TEST-EUR", component: "CART_FRONT" as const }],
      observedSubject: { title: "Test Adventure", platform: "n64", edition: "Standard", variant: null },
      nextAction: "REPLAN",
      reasoningSummary: "A cartridge identifier enables the component-specific N64 playbook.",
      usage: modelUsage,
    };
  },
  async decide(input) {
    const preferred = input.options.includes("EUROPEAN_CART_FAMILY") ? "EUROPEAN_CART_FAMILY" : input.options[0];
    return { choice: preferred, usage: modelUsage };
  },
};

test("worker dynamically replans after a new identifier and resume skips prior queries", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "regionatlas-worker-resume-"));
  try {
    const store = new ResearchRunStore(directory);
    const task = durableTask({
      id: "pilot:n64-resume-test:box-code",
      subjectId: subject.id,
      targetField: "BOX_CODE",
      question: "Which exact box code belongs to this cartridge?",
      priority: "P2",
    });
    const state = createResearchState({
      runId: "resume-test-run",
      taskId: task.id,
      subjectId: subject.id,
      targetField: task.targetField,
      priority: task.priority,
    });
    state.budget.maxSearches = 1;
    state.budget.maxPages = 2;
    const firstSearch = new SearchMock("first");
    const first = await runResearchTaskV2({
      task,
      subject,
      dependencies: { searchProvider: firstSearch, pageFetcher, llmProvider, store },
      resumeState: state,
    });
    assert.equal(firstSearch.requests.length, 1);
    assert.ok(first.state.identifiersSeen.some((identifier) => identifier.type === "PRODUCT_CODE" && identifier.value === "NUS-TEST-EUR"));
    assert.ok(first.routerPlans.length >= 1);
    assert.ok(first.state.normalizedQueries.length === 1);
    assert.equal(first.pages.length, 1);

    first.state.budget.maxSearches = 2;
    const resumedSearch = new SearchMock("resumed");
    const resumed = await runResearchTaskV2({
      task,
      subject,
      dependencies: { searchProvider: resumedSearch, pageFetcher, llmProvider, store },
      resumeState: first.state,
    });
    assert.equal(resumedSearch.requests.length, 1);
    assert.ok(resumedSearch.requests[0].includes("NUS-TEST-EUR"));
    assert.equal(resumed.state.normalizedQueries.length, 2);
    assert.equal(new Set(resumed.state.normalizedQueries).size, 2);
    assert.equal(resumed.pages.length, 2);
    assert.ok(resumed.routerPlans.some((plan) => plan.selectedPlaybook.id === "N64_CART_KNOWN_BOX_UNKNOWN"));
    assert.equal(resumed.providerUsage["mock-search"], 2);
    assert.ok((await store.readState("resume-test-run"))?.queriesAttempted.length === 2);
    assert.ok(await store.readArtifact("resume-test-run", "catalog-context.json", () => null));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("owned scan metadata resolves barcode before search or AI", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "regionatlas-worker-owned-scan-"));
  try {
    const ownedSubject = getResearchSubjectById("catalog:ps4-fortnite");
    assert.ok(ownedSubject);
    const task = durableTask({
      id: "test:owned-scan-barcode",
      subjectId: ownedSubject.id,
      targetField: "BARCODE",
      question: "Which barcode is visible on the owned specimen?",
      priority: "P1",
    });
    const result = await runResearchTaskV2({
      task,
      subject: ownedSubject,
      dependencies: {
        searchProvider: null,
        pageFetcher: { async fetch() { throw new Error("SEARCH_MUST_NOT_RUN"); } },
        store: new ResearchRunStore(directory),
      },
    });
    assert.equal(result.state.status, "CONFIRMED");
    assert.equal(result.resolution.value, "4020628781279");
    assert.equal(result.state.usage.searches, 0);
    assert.equal(result.state.usage.agentTurns, 0);
    assert.ok(result.state.evidence.some((row) => row.evidenceType === "OWN_SCAN"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
