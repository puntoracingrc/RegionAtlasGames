import path from "node:path";
import { readDiskJsonDocument, writeDiskJsonDocument, mutateDiskJsonDocument } from "../json-document-store";
import { defaultResearchBudget, emptyResearchBudgetUsage } from "./budget";
import type { ResearchPriority, ResearchRiskCode } from "./types";
import type { DurableResearchTask, ResearchState, ResearchTargetField } from "./v2-types";

function safeSegment(value: string): string {
  const result = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!result || result === "." || result === "..") throw new Error("INVALID_RESEARCH_PATH_SEGMENT");
  return result.slice(0, 180);
}

export function researchArtifactRoot(rootDir = process.cwd()): string {
  const configured = process.env.RESEARCH_ARTIFACT_DIR?.trim() || "artifacts/research-engine";
  return path.isAbsolute(configured) ? configured : path.join(rootDir, configured);
}

export class ResearchRunStore {
  readonly root: string;

  constructor(root = researchArtifactRoot()) {
    this.root = root;
  }

  runDirectory(runId: string): string {
    return path.join(this.root, "runs", safeSegment(runId));
  }

  statePath(runId: string): string {
    return path.join(this.runDirectory(runId), "state.json");
  }

  async readState(runId: string): Promise<ResearchState | null> {
    return readDiskJsonDocument({
      pathname: this.statePath(runId),
      empty: () => null,
      parse: (raw) => JSON.parse(raw) as ResearchState,
    });
  }

  async writeState(state: ResearchState): Promise<void> {
    await writeDiskJsonDocument(this.statePath(state.runId), state);
  }

  async writeArtifact(runId: string, name: string, value: unknown): Promise<string> {
    const filename = safeSegment(name.endsWith(".json") || name.endsWith(".md") ? name : `${name}.json`);
    const target = path.join(this.runDirectory(runId), filename);
    if (filename.endsWith(".md")) {
      const text = typeof value === "string" ? value : String(value);
      await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir(path.dirname(target), { recursive: true }).then(() => writeFile(target, text.endsWith("\n") ? text : `${text}\n`, "utf8")));
    } else {
      await writeDiskJsonDocument(target, value);
    }
    return target;
  }

  async readArtifact<T>(runId: string, name: string, empty: () => T): Promise<T> {
    const filename = safeSegment(name.endsWith(".json") || name.endsWith(".md") ? name : `${name}.json`);
    if (filename.endsWith(".md")) throw new Error("JSON_RESEARCH_ARTIFACT_REQUIRED");
    return readDiskJsonDocument({
      pathname: path.join(this.runDirectory(runId), filename),
      empty,
      parse: (raw) => JSON.parse(raw) as T,
    });
  }

  queuePath(): string {
    return path.join(this.root, "queue.json");
  }

  async readQueue(): Promise<DurableResearchTask[]> {
    return readDiskJsonDocument({
      pathname: this.queuePath(),
      empty: () => [],
      parse: (raw) => JSON.parse(raw) as DurableResearchTask[],
    });
  }

  async upsertTasks(tasks: DurableResearchTask[]): Promise<number> {
    return mutateDiskJsonDocument({
      pathname: this.queuePath(),
      empty: () => [] as DurableResearchTask[],
      parse: (raw) => JSON.parse(raw) as DurableResearchTask[],
    }, (current) => {
      const merged = new Map(current.map((task) => [task.id, task]));
      for (const task of tasks) merged.set(task.id, { ...merged.get(task.id), ...task });
      return { next: [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), result: tasks.length };
    });
  }

  async updateTask(taskId: string, update: Partial<DurableResearchTask>): Promise<DurableResearchTask | null> {
    return mutateDiskJsonDocument({
      pathname: this.queuePath(),
      empty: () => [] as DurableResearchTask[],
      parse: (raw) => JSON.parse(raw) as DurableResearchTask[],
    }, (current) => {
      let result: DurableResearchTask | null = null;
      const next = current.map((task) => {
        if (task.id !== taskId) return task;
        result = { ...task, ...update, id: task.id, updatedAt: new Date().toISOString() };
        return result;
      });
      return { next, result, changed: result !== null };
    });
  }
}

export function createResearchPhysicalMetrics(): NonNullable<ResearchState["physicalMetrics"]> {
  return {
    physicalEvidenceModeEntries: 0,
    galleryPagesOpened: 0,
    imageCandidatesDiscovered: 0,
    fullResolutionImagesFetched: 0,
    imagesClassified: 0,
    exactTargetImages: 0,
    wrongEditionImagesRejected: 0,
    wrongPlatformImagesRejected: 0,
    ambiguousImagesRejected: 0,
    outerPackageImages: 0,
    innerCaseImages: 0,
    cartImages: 0,
    discImages: 0,
    backCoverImages: 0,
    componentBoundClaims: 0,
    productBoundIdentifiers: 0,
    unboundIdentifierCandidates: 0,
    sellerStickerIdentifiers: 0,
    marketBoundClaims: 0,
    galleriesOpened: 0,
    imagesDiscovered: 0,
    originalImagesResolved: 0,
    imagesInspected: 0,
    subjectAccepted: 0,
    componentAccepted: 0,
    identifierExtractions: 0,
    productBindings: 0,
    rejectedImages: 0,
    duplicateImages: 0,
    thumbnailFailures: 0,
  };
}

export function createResearchTelemetry(): NonNullable<ResearchState["telemetry"]> {
  return {
    releaseMapSeedQueries: 0,
    fieldSpecificQueries: 0,
    regionalQueries: 0,
    localLanguageQueries: 0,
    exactIdentifierQueries: 0,
    identifierCandidatesFound: 0,
    identifierFormatRejected: 0,
    identifierChecksumRejected: 0,
    identifierSubjectConflicts: 0,
    identifierCorroborated: 0,
    identifierPartial: 0,
    fieldsResolvedAfterExactSearch: 0,
    fieldsUnresolvedAfterExhaustion: 0,
    duplicateQueriesPrevented: 0,
    coverageBucketsComplete: 0,
  };
}

export function createResearchState(input: {
  runId: string;
  taskId: string;
  subjectId: string;
  targetField: ResearchTargetField;
  priority: ResearchPriority;
  riskCodes?: ResearchRiskCode[];
  now?: Date;
}): ResearchState {
  const now = (input.now ?? new Date()).toISOString();
  return {
    schemaVersion: 2,
    runId: input.runId,
    taskId: input.taskId,
    subjectId: input.subjectId,
    priority: input.priority,
    status: "QUEUED",
    round: 0,
    targetFields: [input.targetField],
    currentTargetField: input.targetField,
    currentPlaybook: null,
    queriesAttempted: [],
    normalizedQueries: [],
    urlsVisited: [],
    domainsVisited: [],
    identifiersSeen: [],
    evidence: [],
    claims: [],
    conflicts: [],
    rejectedHypotheses: [],
    budget: defaultResearchBudget(input.priority),
    usage: emptyResearchBudgetUsage(),
    lastDecision: null,
    reasoningSummary: null,
    decisionSummary: null,
    nextEvidenceNeeded: [],
    whyStopped: null,
    riskCodes: input.riskCodes ?? [],
    identifierTraces: [],
    searchExhaustion: null,
    coverageLedger: [],
    telemetry: createResearchTelemetry(),
    researchMode: "STANDARD",
    modeTransitions: [],
    evidenceGaps: [],
    productNodes: [],
    productRelations: [],
    identifierBindings: [],
    physicalMetrics: createResearchPhysicalMetrics(),
    createdAt: now,
    updatedAt: now,
  };
}

export function durableTask(input: {
  id: string;
  subjectId: string;
  targetField: ResearchTargetField;
  question: string;
  priority: ResearchPriority;
  evidenceNeeded?: string[];
  riskCodes?: ResearchRiskCode[];
  now?: Date;
}): DurableResearchTask {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id,
    subjectId: input.subjectId,
    targetField: input.targetField,
    question: input.question,
    priority: input.priority,
    evidenceNeeded: input.evidenceNeeded ?? [],
    riskCodes: input.riskCodes ?? [],
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
}
