import { randomUUID } from "node:crypto";
import { PlaywrightResearchBrowserProvider } from "./browser-provider";
import { getResearchSubjectById } from "./catalog-context";
import { compareResearchCatalogBoundary, hashResearchCatalogBoundary } from "./catalog-immutability";
import { OpenAIResearchProvider } from "./openai-provider";
import { HttpResearchPageFetcher } from "./page-fetcher";
import { createConfiguredResearchImageSearchProvider, createConfiguredResearchSearchProvider } from "./search-provider";
import { ResearchRunStore } from "./state-store";
import type { ResearchSubject } from "./types";
import type { DurableResearchTask, ResearchState } from "./v2-types";
import { runResearchTaskV2, type ResearchWorkerResult } from "./worker";

function queueStatus(status: ResearchState["status"]): DurableResearchTask["status"] {
  if (status === "CONFIRMED") return "RESOLVED";
  if (status === "BLOCKED" || status === "BLOCKED_INFRASTRUCTURE" || status === "FAILED") return "BLOCKED";
  if (status === "PARTIAL" || status === "UNRESOLVED") return "UNRESOLVED";
  return "IN_PROGRESS";
}

export function createResearchWorkerDependencies(store = new ResearchRunStore()) {
  const openai = process.env.OPENAI_API_KEY?.trim() ? new OpenAIResearchProvider() : null;
  const numeric = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    searchProvider: createConfiguredResearchSearchProvider({ timeoutMs: numeric("RESEARCH_SEARCH_TIMEOUT_MS", 12_000), maxTechnicalRetries: numeric("RESEARCH_MAX_TECHNICAL_RETRIES", 1) }),
    pageFetcher: new HttpResearchPageFetcher({ timeoutMs: numeric("RESEARCH_PAGE_TIMEOUT_MS", 12_000) }),
    browserProvider: new PlaywrightResearchBrowserProvider({ timeoutMs: numeric("RESEARCH_BROWSER_TIMEOUT_MS", 20_000) }),
    imageSearchProvider: createConfiguredResearchImageSearchProvider({ timeoutMs: numeric("RESEARCH_IMAGE_SEARCH_TIMEOUT_MS", 12_000), maxTechnicalRetries: numeric("RESEARCH_MAX_TECHNICAL_RETRIES", 1) }),
    llmProvider: openai,
    visionProvider: openai,
    store,
  };
}

export async function runDurableResearchTask(input: {
  task: DurableResearchTask;
  rootDir?: string;
  store?: ResearchRunStore;
  subject?: ResearchSubject | null;
  resumeState?: ResearchState | null;
  runId?: string;
  franchiseId?: string | null;
}): Promise<ResearchWorkerResult & { catalogImmutability: { identical: boolean; changed: string[]; before: string; after: string } }> {
  const rootDir = input.rootDir ?? process.cwd();
  const store = input.store ?? new ResearchRunStore();
  const subject = input.subject ?? getResearchSubjectById(input.task.subjectId);
  if (!subject) throw new Error(`RESEARCH_SUBJECT_NOT_FOUND:${input.task.subjectId}`);
  const runId = input.resumeState?.runId ?? input.runId ?? randomUUID();
  const before = await hashResearchCatalogBoundary(rootDir);
  await store.upsertTasks([input.task]);
  await store.updateTask(input.task.id, { status: "IN_PROGRESS" });
  let result: ResearchWorkerResult;
  try {
    result = await runResearchTaskV2({
      task: input.task,
      subject,
      dependencies: createResearchWorkerDependencies(store),
      runId,
      resumeState: input.resumeState ?? null,
      rootDir,
      franchiseId: input.franchiseId ?? null,
    });
  } catch (error) {
    await store.updateTask(input.task.id, { status: "BLOCKED" });
    throw error;
  }
  const after = await hashResearchCatalogBoundary(rootDir);
  const comparison = compareResearchCatalogBoundary(before, after);
  const immutability = { ...comparison, before: before.digest, after: after.digest };
  await store.writeArtifact(runId, "catalog-immutability.json", immutability);
  if (!comparison.identical) {
    await store.updateTask(input.task.id, { status: "BLOCKED" });
    throw new Error(`CATALOG_MUTATION_DETECTED:${comparison.changed.join(",")}`);
  }
  await store.updateTask(input.task.id, { status: queueStatus(result.state.status) });
  return { ...result, catalogImmutability: immutability };
}
