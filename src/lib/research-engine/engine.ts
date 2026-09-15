import { createHash } from "node:crypto";
import { buildTaskQueries } from "./query-planner";
import { sourceProfileForUrl } from "./source-policy";
import type {
  ResearchAgentAdapter,
  ResearchAgentResult,
  ResearchClaim,
  ResearchEvidence,
  ResearchQuery,
  ResearchSearchHit,
  ResearchSearchProvider,
  ResearchSubject,
  ResearchTask,
} from "./types";

export type ResearchTaskRun = {
  subjectId: string;
  taskId: string;
  provider: string;
  agent: string | null;
  queries: ResearchQuery[];
  hits: ResearchSearchHit[];
  evidence: ResearchEvidence[];
  claims: ResearchClaim[];
  followUpQueries: string[];
  stopReason: ResearchAgentResult["stopReason"] | "search_only";
};

function evidenceId(hit: ResearchSearchHit): string {
  return `search-${createHash("sha256").update(`${hit.url}\n${hit.title}`).digest("hex").slice(0, 20)}`;
}

function hitToEvidence(hit: ResearchSearchHit, observedAt: string): ResearchEvidence {
  const profile = sourceProfileForUrl(hit.url);
  return {
    id: evidenceId(hit),
    kind: profile.kind,
    label: hit.title || hit.sourceHost || "Resultado de búsqueda",
    url: hit.url,
    sourceHost: hit.sourceHost,
    observedAt,
    summary: hit.snippet,
    supports: profile.supports,
  };
}

export async function runResearchTask(input: {
  subject: ResearchSubject;
  task: ResearchTask;
  provider: ResearchSearchProvider;
  agent?: ResearchAgentAdapter | null;
  maxQueries?: number;
  maxHitsPerQuery?: number;
  observedAt?: Date;
}): Promise<ResearchTaskRun> {
  const maxQueries = Math.max(1, Math.min(20, input.maxQueries ?? 8));
  const maxHitsPerQuery = Math.max(1, Math.min(20, input.maxHitsPerQuery ?? 8));
  const queries = buildTaskQueries(input.subject, input.task).slice(0, maxQueries);
  const hits: ResearchSearchHit[] = [];

  for (const planned of queries) {
    const found = await input.provider.search(planned.query);
    hits.push(...found.slice(0, maxHitsPerQuery));
  }

  const uniqueHits = [...new Map(hits.map((hit) => [hit.url, hit])).values()];
  const observedAt = (input.observedAt ?? new Date()).toISOString();
  const evidence = uniqueHits.map((hit) => hitToEvidence(hit, observedAt));

  if (!input.agent) {
    return {
      subjectId: input.subject.id,
      taskId: input.task.id,
      provider: input.provider.name,
      agent: null,
      queries,
      hits: uniqueHits,
      evidence,
      claims: [],
      followUpQueries: [],
      stopReason: "search_only",
    };
  }

  const result = await input.agent.investigate({
    subject: input.subject,
    task: input.task,
    queries,
    evidence,
    claims: [],
  });

  return {
    subjectId: input.subject.id,
    taskId: input.task.id,
    provider: input.provider.name,
    agent: input.agent.name,
    queries,
    hits: uniqueHits,
    evidence: [...evidence, ...result.evidence],
    claims: result.claims,
    followUpQueries: result.followUpQueries,
    stopReason: result.stopReason,
  };
}
