import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { runDurableResearchTask } from "../src/lib/research-engine/runtime";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";

function runIdFromArgs(argv: string[]): string {
  const index = argv.indexOf("--run");
  if (index < 0 || !argv[index + 1]) throw new Error("Usage: npm run research:resume -- --run <run-id>");
  return argv[index + 1];
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  assertResearchEngineEnabled();
  const capabilities = researchRuntimeCapabilities();
  if (!capabilities.openai) throw new Error("OPENAI_NOT_CONFIGURED");
  if (!capabilities.braveSearch && !capabilities.googleSearch && !capabilities.serpApi) throw new Error("RESEARCH_SEARCH_NOT_CONFIGURED");
  const store = new ResearchRunStore();
  const runId = runIdFromArgs(process.argv.slice(2));
  const state = await store.readState(runId);
  if (!state) throw new Error(`RESEARCH_RUN_NOT_FOUND:${runId}`);
  const task = (await store.readQueue()).find((candidate) => candidate.id === state.taskId);
  if (!task) throw new Error(`RESEARCH_TASK_NOT_FOUND:${state.taskId}`);
  const result = await runDurableResearchTask({ task, store, resumeState: state, franchiseId: "assassins-creed" });
  console.log(JSON.stringify({
    runId,
    taskId: task.id,
    status: result.state.status,
    round: result.state.round,
    repeatedQueries: result.state.normalizedQueries.length - new Set(result.state.normalizedQueries).size,
    resolution: result.resolution,
    usage: result.state.usage,
    artifactDirectory: result.artifactDirectory,
    catalogMutations: result.catalogImmutability.changed.length,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "RESEARCH_RESUME_FAILED");
  process.exitCode = 1;
});
