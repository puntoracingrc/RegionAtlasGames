import { loadResearchEnvironment } from "../src/lib/research-engine/env";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";
import { scanAndBuildDurableTasks } from "../src/lib/research-engine/task-bridge";

type Args = { platformSlug: string | null; query: string | null; limit: number | null; includeClean: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { platformSlug: null, query: null, limit: 250, includeClean: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--platform") args.platformSlug = argv[++index] ?? null;
    else if (value === "--query") args.query = argv[++index] ?? null;
    else if (value === "--limit") {
      const raw = argv[++index] ?? "250";
      args.limit = raw === "all" || raw === "0" ? null : Math.max(1, Number.parseInt(raw, 10) || 250);
    } else if (value === "--include-clean") args.includeClean = true;
    else if (value === "--help" || value === "-h") {
      console.log("Usage: npm run research:queue -- [--platform slug] [--query text] [--limit n|all] [--include-clean]");
      process.exit(0);
    }
  }
  return args;
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const { scan, tasks } = scanAndBuildDurableTasks(args);
  const store = new ResearchRunStore();
  await store.upsertTasks(tasks);
  console.log(JSON.stringify({
    queuePath: store.queuePath(),
    scanned: scan.summary.scanned,
    flagged: scan.summary.flagged,
    queued: tasks.length,
    priorities: tasks.reduce<Record<string, number>>((counts, task) => ({ ...counts, [task.priority]: (counts[task.priority] ?? 0) + 1 }), {}),
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "RESEARCH_QUEUE_FAILED");
  process.exitCode = 1;
});
