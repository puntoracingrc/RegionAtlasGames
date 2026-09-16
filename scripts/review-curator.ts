#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- CLI validates untyped historical queue JSON at its boundary. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import {
  applyResolutionToQueueDocument,
  physicalEvidenceBundleFromReviewItem,
  researchTasksFromBundle,
  resolveReviewBundle,
  validatePhysicalEvidenceBundle,
  type CuratorResolution,
  type PhysicalEvidenceBundleV1,
} from "../src/lib/review-curator";

type Queue = { schemaVersion?: number; updatedAt?: string; items: Array<Record<string, any>>; decisions: Array<Record<string, any>> };
type Args = {
  queueFile: string; outputDir: string; priceObservations: string | null; limit: number;
  shadow: boolean; apply: boolean; holdout: boolean; authoritative: boolean; item: string | null; triageBucket: string | null;
};

function flagValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : null;
}

function parseArgs(argv: string[]): Args {
  const queueFile = flagValue(argv, "--queue-file") ?? "data/ebay-regional-campaigns/review-queue.json";
  const limit = Number(flagValue(argv, "--limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be an integer from 1 to 500.");
  return {
    queueFile, limit, shadow: argv.includes("--shadow"), apply: argv.includes("--apply-decisions"), holdout: argv.includes("--holdout"),
    authoritative: argv.includes("--authoritative"),
    item: flagValue(argv, "--item"), triageBucket: flagValue(argv, "--triage-bucket"),
    outputDir: flagValue(argv, "--output-dir") ?? "artifacts/review-curator/latest",
    priceObservations: flagValue(argv, "--price-observations"),
  };
}

async function loadQueueForRun(args: Args): Promise<Queue> {
  if (!args.authoritative) return loadQueue(args.queueFile);
  if (!args.shadow || args.apply || args.holdout) throw new Error("--authoritative is read-only and may only be used with --shadow.");
  const { getPriceReviewTriageView } = await import("../src/lib/admin-price-review");
  const view = await getPriceReviewTriageView(Math.max(5_000, args.limit), "all");
  return { schemaVersion: 1, updatedAt: view.revision, items: view.items, decisions: [] };
}

function loadQueue(file: string): Queue {
  const queue = JSON.parse(readFileSync(file, "utf8")) as Queue;
  if (!Array.isArray(queue.items) || !Array.isArray(queue.decisions)) throw new Error("Invalid review queue.");
  return queue;
}

function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, file);
}

function diverse(items: Array<Record<string, any>>, limit: number): Array<Record<string, any>> {
  const groups = new Map<string, Array<Record<string, any>>>();
  for (const item of items) {
    const key = String(item.triageBucket ?? item.reason ?? "manual_match");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const result: Array<Record<string, any>> = [];
  const keys = [...groups.keys()].sort();
  while (result.length < limit && keys.length) {
    for (const key of [...keys]) {
      const row = groups.get(key)?.shift();
      if (row) result.push(row);
      if (!groups.get(key)?.length) keys.splice(keys.indexOf(key), 1);
      if (result.length === limit) break;
    }
  }
  return result;
}

function blinded(item: Record<string, any>): Record<string, any> {
  const evidence = item.evidence && typeof item.evidence === "object" ? { ...item.evidence } : {};
  // Human decision, post-review notes and explicit reviewed markers are withheld from inference.
  delete evidence.reviewNotes;
  evidence.regionEvidence = Array.isArray(evidence.regionEvidence)
    ? evidence.regionEvidence.filter((value: unknown) => !/human_reviewed|admin/i.test(String(value))) : [];
  const copy: Record<string, any> = { ...item, status: "pending", evidence };
  for (const key of ["decision", "decidedAt", "adminEditedAt", "curatorResolution"]) delete copy[key];
  return copy;
}

function bundleForItem(item: Record<string, any>, queueVersion: string): PhysicalEvidenceBundleV1 {
  const derived = physicalEvidenceBundleFromReviewItem(item, queueVersion);
  if (item.physicalEvidenceBundle && typeof item.physicalEvidenceBundle === "object") {
    try {
      validatePhysicalEvidenceBundle(item.physicalEvidenceBundle);
      if (item.physicalEvidenceBundle.reviewItemId === item.id
        && item.physicalEvidenceBundle.inputHash === derived.inputHash
        && item.physicalEvidenceBundle.evidenceHash === derived.evidenceHash) return item.physicalEvidenceBundle;
    } catch {
      // A stale/invalid embedded bundle is derived again from the immutable queue evidence.
    }
  }
  return derived;
}

function expectedDecision(item: Record<string, any>): string {
  if (item.status === "rejected") return "REJECT";
  const decision = item.decision ?? {};
  const before = item.evidence?.searchedCatalogId ?? item.catalogId;
  return decision.catalogId && before && decision.catalogId !== before ? "REROUTE_EXISTING" : "ACCEPT_EXISTING";
}

function applyResolutions(queueFile: string, bundles: PhysicalEvidenceBundleV1[], resolutions: CuratorResolution[], priceFile: string | null): { applied: number; stale: number; observations: number } {
  if (process.env.CURATOR_APPLY_EXISTING_DECISIONS !== "1") throw new Error("CURATOR_APPLY_EXISTING_DECISIONS=1 is required.");
  if (process.env.CURATOR_ALLOW_CATALOG_MUTATIONS !== "0" || process.env.CURATOR_ALLOW_AUTOMERGE !== "0") throw new Error("Catalog mutation and automerge flags must remain 0.");
  const queue = loadQueue(queueFile);
  const byBundle = new Map(bundles.map((bundle) => [bundle.reviewItemId, bundle]));
  const observations: Record<string, unknown>[] = priceFile && existsSync(priceFile) ? (JSON.parse(readFileSync(priceFile, "utf8")).listings ?? []) : [];
  let applied = 0;
  let stale = 0;
  for (const resolution of resolutions) {
    const bundle = byBundle.get(resolution.reviewItemId);
    if (!bundle) { stale += 1; continue; }
    const result = applyResolutionToQueueDocument(queue, bundle, resolution);
    if (result.stale) stale += 1;
    if (result.applied) applied += 1;
    if (result.priceObservation) observations.push(result.priceObservation);
  }
  queue.updatedAt = new Date().toISOString();
  atomicJson(queueFile, queue);
  if (priceFile) atomicJson(priceFile, { schemaVersion: 1, source: "review-curator", collectedAt: queue.updatedAt, listings: observations });
  return { applied, stale, observations: observations.length };
}

function markdownReport(report: Record<string, any>): string {
  const escape = (value: unknown) => String(value ?? "—").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const lines = [
    `# Review Curator ${report.mode} report`, "",
    `- Run: \`${report.runId}\``, `- Cases: ${report.cases}`, `- Queue version: \`${report.queueVersion}\``,
    `- Brave requests: ${report.braveRequests}`, `- OpenAI calls: ${report.openAiCalls}`, `- Total cost: $${Number(report.totalCostUsd).toFixed(6)}`,
    `- Catalog mutations: ${report.catalogMutations}`, `- Price mutations: ${report.priceMutations}`, `- Authoritative queue mutations: ${report.authoritativeQueueMutations}`, "",
    "## Decisions", "",
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`), "",
  ];
  if (report.holdout) lines.push(
    "## Holdout", "",
    `- Cases: ${report.holdout.cases}`,
    `- Reconstructable pre-decision evidence: ${report.holdout.reconstructablePreDecisionEvidence}`,
    `- Accuracy including defers: ${(report.holdout.accuracyIncludingDefers * 100).toFixed(1)}%`,
    `- Reject precision: ${report.holdout.rejectPrecision === null ? "N/A" : `${(report.holdout.rejectPrecision * 100).toFixed(1)}%`}`,
    `- Defer rate: ${(report.holdout.deferRate * 100).toFixed(1)}%`,
    `- Critical false accepts: ${report.holdout.criticalFalseAccepts}`,
    `- Limitation: ${report.holdout.limitation}`, "",
  );
  lines.push(
    "## Cases", "",
    "| Review item | Platform | Listing | Original reason | Proposed decision | Original catalog | Resolved catalog | Region | Edition | Condition | Reused evidence | New evidence | Brave | Vision | Cost | Confidence | Remaining gaps |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|",
    ...report.casesDetail.map((row: Record<string, any>) => `| ${[
      row.reviewItemId, row.platform, row.listing, row.originalReason, row.decision, row.originalCatalogId, row.resolvedCatalogId,
      row.region, row.edition, row.condition, row.reusedEvidence.join(", "), row.newEvidence.join(", "), row.braveRequests,
      row.visionRequests, `$${Number(row.costUsd).toFixed(6)}`, Number(row.confidence).toFixed(2), row.remainingGaps.join(", "),
    ].map(escape).join(" | ")} |`), "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (process.env.CURATOR_ENABLED !== "1") throw new Error("CURATOR_ENABLED=1 is required even for an explicit run.");
  if (args.shadow === args.apply) throw new Error("Choose exactly one of --shadow or --apply-decisions.");
  if (args.apply && process.env.CURATOR_SHADOW !== "0") throw new Error("CURATOR_SHADOW=0 is required for --apply-decisions.");
  const queue = await loadQueueForRun(args);
  const queueVersion = String(queue.updatedAt ?? "unknown");
  const candidates = queue.items.filter((item) => item.source === "ebay-es")
    .filter((item) => args.holdout
      ? ["accepted", "rejected", "rerouted"].includes(item.status)
      : item.status === "pending" || (item.status === "deferred" && Date.parse(String(item.nextEligibleAt ?? "")) <= Date.now()))
    .filter((item) => !args.item || item.id === args.item)
    .filter((item) => !args.triageBucket || item.triageBucket === args.triageBucket);
  const selected = diverse(candidates, args.limit);
  // The limit is applied between review cases. Once selected, every game's
  // complete evidence/research/resolution cycle runs atomically to completion.
  if (!selected.length) throw new Error("No eligible eBay review items are available for this run.");
  const catalogIds = new Set((catalogData as Array<{ id: string }>).map((game) => game.id));
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const runId = `curator-${Date.now().toString(36)}`;
  const sourceItems = args.holdout ? selected.map(blinded) : selected;
  const bundles = sourceItems.map((item) => bundleForItem(item, queueVersion));
  const resolutions = bundles.map((bundle) => resolveReviewBundle(bundle, { catalogIds, gitSha, runId }));
  const cases = resolutions.map((resolution, index) => ({
    reviewItemId: resolution.reviewItemId, listing: bundles[index].listing.title, platform: bundles[index].subject.platform,
    originalReason: bundles[index].reason, decision: resolution.decision, originalCatalogId: bundles[index].catalog.searchedCatalogId,
    resolvedCatalogId: resolution.resolvedCatalogId, region: bundles[index].regional.detectedRegion, edition: bundles[index].subject.edition,
    condition: bundles[index].condition.bucket, reusedEvidence: bundles[index].confirmed, newEvidence: [], braveRequests: 0, visionRequests: 0,
    costUsd: 0, confidence: resolution.confidence, remainingGaps: resolution.evidenceGaps,
    researchTasks: researchTasksFromBundle(bundles[index]),
  }));
  const counts = Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "DEFER", "PROPOSE_NEW_VARIANT", "NEEDS_HUMAN"].map((decision) => [decision, resolutions.filter((row) => row.decision === decision).length]));
  let holdout: Record<string, unknown> | null = null;
  if (args.holdout) {
    const comparisons = resolutions.map((resolution, index) => ({ id: resolution.reviewItemId, expected: expectedDecision(selected[index]), predicted: resolution.decision }));
    const correct = comparisons.filter((row) => row.expected === row.predicted).length;
    const precision = (decision: string) => {
      const predicted = comparisons.filter((row) => row.predicted === decision);
      return predicted.length ? predicted.filter((row) => row.expected === decision).length / predicted.length : null;
    };
    holdout = {
      cases: comparisons.length, reconstructablePreDecisionEvidence: false,
      limitation: "Historical rows retain post-review catalog fields; decisions and human notes were blinded, but a true pre-decision snapshot is unavailable.",
      correct, accuracyIncludingDefers: comparisons.length ? correct / comparisons.length : 0,
      acceptPrecision: precision("ACCEPT_EXISTING"), reroutePrecision: precision("REROUTE_EXISTING"), rejectPrecision: precision("REJECT"),
      deferRate: comparisons.length ? comparisons.filter((row) => row.predicted === "DEFER").length / comparisons.length : 0,
      criticalFalseAccepts: comparisons.filter((row) => ["ACCEPT_EXISTING", "REROUTE_EXISTING"].includes(row.predicted) && row.predicted !== row.expected).length,
      comparisons,
    };
  }
  const apply = args.apply ? applyResolutions(args.queueFile, bundles, resolutions, args.priceObservations) : null;
  const report = {
    schemaVersion: 1, runId, mode: args.holdout ? "holdout" : args.shadow ? "shadow" : "apply", generatedAt: new Date().toISOString(),
    queueFile: args.authoritative ? "authoritative-worker" : args.queueFile, queueVersion, gitSha, cases: cases.length, counts, braveRequests: 0, openAiCalls: 0, totalCostUsd: 0,
    catalogMutations: 0, priceMutations: 0, authoritativeQueueMutations: args.shadow ? 0 : apply?.applied ?? 0,
    holdout, apply, casesDetail: cases,
  };
  mkdirSync(args.outputDir, { recursive: true });
  atomicJson(path.join(args.outputDir, args.holdout ? "holdout.json" : "shadow-pilot.json"), report);
  atomicJson(path.join(args.outputDir, args.holdout ? "holdout-bundles.json" : "shadow-bundles.json"), bundles);
  writeFileSync(path.join(args.outputDir, "report.md"), markdownReport(report), "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
