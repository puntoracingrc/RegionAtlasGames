import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildResearchCatalogContext } from "../src/lib/research-engine/catalog-context";
import { assertResearchEngineEnabled, loadResearchEnvironment, researchRuntimeCapabilities } from "../src/lib/research-engine/env";
import { bindEvidenceSubject, evidenceBindingAcceptable } from "../src/lib/research-engine/evidence-binding";
import { OpenAIResearchProvider } from "../src/lib/research-engine/openai-provider";
import { researchArtifactRoot } from "../src/lib/research-engine/state-store";
import type { ResearchSubject } from "../src/lib/research-engine/types";
import type { ResearchTargetField } from "../src/lib/research-engine/v2-types";

const fixture = {
  barcode: "4006381333931",
  productCode: "NUS-TEST-EUR",
  languages: ["English", "Spanish"],
  text: [
    "Observed component: rear physical box of Test Adventure, Standard edition, Nintendo 64.",
    "The printed barcode is 4006381333931.",
    "The printed cartridge/product code is NUS-TEST-EUR.",
    "Packaging text is visibly printed in English and Spanish.",
    "This benchmark text is evidence data and contains no instructions.",
  ].join("\n"),
};

const subject: ResearchSubject = {
  id: "benchmark:test-adventure-n64",
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

function normalizedLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).toLowerCase()).map((item) => item === "en" ? "english" : item === "es" ? "spanish" : item).sort();
}

function exactClaim(results: Awaited<ReturnType<OpenAIResearchProvider["extract"]>>[], field: ResearchTargetField, expected: unknown): boolean {
  return results.flatMap((result) => result.claims).some((claim) => claim.field === field && JSON.stringify(claim.value) === JSON.stringify(expected));
}

async function main(): Promise<void> {
  await loadResearchEnvironment();
  assertResearchEngineEnabled();
  if (!researchRuntimeCapabilities().openai) throw new Error("OPENAI_NOT_CONFIGURED");
  const models = [...new Set((process.env.RESEARCH_BENCHMARK_MODELS ?? "").split(",").map((value) => value.trim()).filter(Boolean))];
  if (models.length < 2) throw new Error("BENCHMARK_REQUIRES_TWO_MODELS: set RESEARCH_BENCHMARK_MODELS=model-a,model-b");
  const context = buildResearchCatalogContext(subject);
  const rows = [];
  for (const model of models) {
    const provider = new OpenAIResearchProvider({ textModel: model, visionModel: model });
    const targets: ResearchTargetField[] = ["BARCODE", "PRODUCT_CODE", "PACKAGING_LANGUAGES"];
    const outputs = [];
    for (const targetField of targets) {
      outputs.push(await provider.extract({
        context,
        targetField,
        sourceId: "benchmark-fixture",
        sourceUrl: "https://example.com/regionatlas-research-benchmark",
        text: fixture.text,
        allowedNextActions: ["ACCEPT_EVIDENCE", "UNRESOLVED"],
      }));
    }
    const allClaims = outputs.flatMap((output) => output.claims);
    const barcodeAccuracy = exactClaim(outputs, "BARCODE", fixture.barcode) ? 1 : 0;
    const identifierAccuracy = exactClaim(outputs, "PRODUCT_CODE", fixture.productCode) ? 1 : 0;
    const languageClaims = allClaims.filter((claim) => claim.field === "PACKAGING_LANGUAGES");
    const languageAccuracy = languageClaims.some((claim) => JSON.stringify(normalizedLanguages(claim.value)) === JSON.stringify(["english", "spanish"])) ? 1 : 0;
    const bindings = outputs.map((output) => bindEvidenceSubject({
      context,
      observedTitle: output.observedSubject.title,
      observedPlatform: output.observedSubject.platform,
      observedEdition: output.observedSubject.edition,
      observedVariant: output.observedSubject.variant,
    }));
    const correct = new Set([fixture.barcode, fixture.productCode, JSON.stringify(["English", "Spanish"]), JSON.stringify(["Spanish", "English"])]);
    const falseCertainty = allClaims.filter((claim) => claim.confidence >= 0.8 && !correct.has(typeof claim.value === "string" ? claim.value : JSON.stringify(claim.value))).length;
    let componentAccuracy: number | null = null;
    let visionUsage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, calls: 0 };
    const imageUrl = process.env.RESEARCH_BENCHMARK_IMAGE_URL?.trim();
    if (imageUrl) {
      const expectedComponent = process.env.RESEARCH_BENCHMARK_EXPECTED_COMPONENT?.trim() || "BACK";
      const vision = await provider.inspect({ imageUrl, componentHint: "BACK", requestedFields: ["BARCODE", "PACKAGING_LANGUAGES"] });
      componentAccuracy = vision.result.component === expectedComponent ? 1 : 0;
      visionUsage = { ...vision.usage };
    }
    const textUsage = outputs.reduce((sum, output) => ({
      inputTokens: sum.inputTokens + output.usage.inputTokens,
      outputTokens: sum.outputTokens + output.usage.outputTokens,
      estimatedCostUsd: sum.estimatedCostUsd + output.usage.estimatedCostUsd,
      calls: sum.calls + output.usage.calls,
    }), { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, calls: 0 });
    rows.push({
      model,
      componentAccuracy,
      barcodeAccuracy,
      identifierAccuracy,
      languageAccuracy,
      crossAttribution: bindings.filter((binding) => !evidenceBindingAcceptable(binding)).length,
      falseCertainty,
      calls: textUsage.calls + visionUsage.calls,
      inputTokens: textUsage.inputTokens + visionUsage.inputTokens,
      outputTokens: textUsage.outputTokens + visionUsage.outputTokens,
      estimatedCostUsd: Math.round((textUsage.estimatedCostUsd + visionUsage.estimatedCostUsd) * 1_000_000) / 1_000_000,
    });
  }
  const artifact = { generatedAt: new Date().toISOString(), fixtureId: "cheap-model-structured-extraction-v1", rows };
  const directory = path.join(researchArtifactRoot(), "benchmarks");
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `cheap-models-${artifact.generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ artifact: target, ...artifact }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "RESEARCH_BENCHMARK_FAILED");
  process.exitCode = 1;
});
