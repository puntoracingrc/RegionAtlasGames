import { evaluateResearchGoldenSet } from "../src/lib/research-engine/golden-evaluator";

async function main(): Promise<void> {
  const result = await evaluateResearchGoldenSet();
  console.log(JSON.stringify({
    cases: result.results.length,
    passed: result.passed,
    failed: result.failed,
    physical: result.results.filter((row) => row.group === "physical"),
    n64: result.results.filter((row) => row.group === "n64"),
  }, null, 2));
  if (result.failed) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "RESEARCH_GOLDEN_FAILED");
  process.exitCode = 1;
});
