import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { runDurableResearchTask } from "../src/lib/research-engine/runtime";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";

function taskIdFromArgs(argv: string[]): string {
  const index = argv.indexOf("--task");
  if (index < 0 || !argv[index + 1]) throw new Error("Usage: npm run research:run -- --task <id>");
  return argv[index + 1];
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  assertResearchEngineEnabled();
  const capabilities = researchRuntimeCapabilities();
  if (!capabilities.openai) throw new Error("OPENAI_NOT_CONFIGURED");
  if (!capabilities.googleSearch && !capabilities.serpApi) throw new Error("RESEARCH_SEARCH_NOT_CONFIGURED");
  const store = new ResearchRunStore();
  const taskId = taskIdFromArgs(process.argv.slice(2));
  const task = (await store.readQueue()).find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`RESEARCH_TASK_NOT_FOUND:${taskId}`);
  const result = await runDurableResearchTask({ task, store, franchiseId: "assassins-creed" });
  console.log(JSON.stringify({
    runId: result.state.runId,
    taskId,
    status: result.state.status,
    resolution: result.resolution,
    usage: result.state.usage,
    artifactDirectory: result.artifactDirectory,
    catalogMutations: result.catalogImmutability.changed.length,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "RESEARCH_RUN_FAILED");
  process.exitCode = 1;
});
