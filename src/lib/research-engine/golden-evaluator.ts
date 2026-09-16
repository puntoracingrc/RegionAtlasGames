import { readFile } from "node:fs/promises";
import path from "node:path";
import { incompatiblePlatformIdentifiers } from "./platform-identifiers";
import { parsePlatformKnowledge } from "./knowledge-schema";

export type ResearchGoldenResult = { id: string; passed: boolean; actual: string; expected: string; group: "physical" | "n64" };

type GoldenCase = {
  id: string;
  kind: "PHYSICAL_TAXONOMY" | "COMPONENT_CONTENT" | "PLATFORM_IDENTIFIER" | "REGION_EVIDENCE";
  input: Record<string, unknown>;
  expected: string;
};

type N64GoldenCase = {
  id: string;
  ruleId: string;
  expectedAllowed?: string;
  expectedForbidden?: string;
  expectedRuleContains?: string;
};

type GoldenDocument = {
  schemaVersion: number;
  runtimeUse: string;
  cases: GoldenCase[];
  n64Cases: N64GoldenCase[];
};

export function classifyPhysicalProductSignals(input: Record<string, unknown>): string {
  if (input.canceledPhysical === true) return "CANCELED_PHYSICAL";
  if (input.digitalOnly === true) return "DIGITAL_ONLY";
  if (input.bonusItemOnly === true && input.gameIncluded !== true) return "BONUS_ITEM_ONLY";
  if (input.gameKeyCard === true) return "GAME_KEY_CARD";
  if (input.codeInBox === true) return "CODE_IN_BOX";
  if (input.collector === true && input.gameIncluded === false) return "COLLECTOR_WITHOUT_PHYSICAL_GAME";
  if (input.collector === true && input.gameIncluded === true) return "COLLECTOR_WITH_PHYSICAL_GAME";
  if (input.fullGameOnMedia === true) return "PHYSICAL_FULL_GAME";
  return "UNKNOWN_PHYSICAL_STATUS";
}

function evaluateCase(test: GoldenCase): string {
  if (test.kind === "PHYSICAL_TAXONOMY") return classifyPhysicalProductSignals(test.input);
  if (test.kind === "PLATFORM_IDENTIFIER") {
    const platform = String(test.input.platformSlug ?? "");
    const identifier = String(test.input.identifier ?? "");
    return incompatiblePlatformIdentifiers(platform, [identifier]).length ? "PLATFORM_IDENTIFIER_CONFLICT" : "PLATFORM_IDENTIFIER_COMPATIBLE";
  }
  if (test.kind === "COMPONENT_CONTENT") {
    return /voucher|code/i.test(String(test.input.observedForm ?? "")) ? "VOUCHER" : "UNKNOWN_COMPONENT_CONTENT";
  }
  if (test.kind === "REGION_EVIDENCE") {
    return test.input.retailerCountry && test.input.exactPackageObserved !== true ? "EVIDENCE_MARKET_ONLY" : "PACKAGE_MARKET_EVIDENCE";
  }
  return "UNSUPPORTED_GOLDEN_CASE";
}

export async function evaluateResearchGoldenSet(rootDir = process.cwd()): Promise<{
  document: GoldenDocument;
  results: ResearchGoldenResult[];
  passed: number;
  failed: number;
}> {
  const goldenPath = path.join(rootDir, "data/research/golden/physical-release-research-v1.json");
  const document = JSON.parse(await readFile(goldenPath, "utf8")) as GoldenDocument;
  if (document.schemaVersion !== 1 || document.runtimeUse !== "FORBIDDEN" || !Array.isArray(document.cases) || !Array.isArray(document.n64Cases)) {
    throw new Error("INVALID_RESEARCH_GOLDEN_SCHEMA");
  }
  const n64 = parsePlatformKnowledge(JSON.parse(await readFile(path.join(rootDir, "data/research-engine/knowledge/platforms/n64.json"), "utf8")));
  const physicalResults = document.cases.map((test): ResearchGoldenResult => {
    const actual = evaluateCase(test);
    return { id: test.id, passed: actual === test.expected, actual, expected: test.expected, group: "physical" };
  });
  const n64Results = document.n64Cases.map((test): ResearchGoldenResult => {
    const rule = n64.identifierRules.find((candidate) => candidate.id === test.ruleId);
    const checks = [
      !test.expectedAllowed || rule?.allowedConclusions?.includes(test.expectedAllowed),
      !test.expectedForbidden || rule?.forbiddenConclusions?.includes(test.expectedForbidden),
      !test.expectedRuleContains || rule?.rule?.toLowerCase().includes(test.expectedRuleContains.toLowerCase()),
    ];
    const actual = rule && checks.every(Boolean) ? "RULE_MATCH" : "RULE_MISMATCH";
    return { id: test.id, passed: actual === "RULE_MATCH", actual, expected: "RULE_MATCH", group: "n64" };
  });
  const results = [...physicalResults, ...n64Results];
  return { document, results, passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length };
}
