import { scanResearchCatalog, type ResearchCatalogScanOptions } from "./catalog-scanner";
import { durableTask } from "./state-store";
import type { ResearchClaimField, ResearchScanResult, ResearchTask } from "./types";
import type { DurableResearchTask, ResearchTargetField } from "./v2-types";

const targetByClaimField: Record<ResearchClaimField, ResearchTargetField> = {
  physicalExistence: "PHYSICAL_EXISTENCE",
  physicalContentStatus: "PHYSICAL_PRODUCT_TYPE",
  releaseStatus: "RELEASE_STATUS",
  platform: "CANONICAL_IDENTITY",
  edition: "CANONICAL_IDENTITY",
  barcode: "BARCODE",
  productCode: "PRODUCT_CODE",
  market: "MARKET_REGION",
  packagingLanguages: "PACKAGING_LANGUAGES",
  softwareLanguages: "SOFTWARE_LANGUAGES",
  contents: "BUNDLE_CONTENTS",
};

function targetForFoundationTask(task: ResearchTask): ResearchTargetField {
  const field = task.riskCodes
    .map((code) => {
      if (code === "PLATFORM_IDENTIFIER_CONFLICT" || code === "UNCONFIRMED_PHYSICAL_VARIANT") return "CANONICAL_IDENTITY";
      if (code === "MISSING_BARCODE") return "BARCODE";
      if (code === "MISSING_MARKET_MAPPING" || code === "GENERIC_REGION") return "MARKET_REGION";
      if (code === "MISSING_PACKAGING_LANGUAGES") return "PACKAGING_LANGUAGES";
      if (code === "CANCELED_RELEASE_COUNTED_AS_PHYSICAL") return "RELEASE_STATUS";
      if (["PHYSICAL_STATUS_CONFLICT", "DOWNLOAD_CODE_COUNTED_AS_DISC", "STEELBOOK_WITHOUT_GAME_COUNTED_AS_EDITION"].includes(code)) return "PHYSICAL_PRODUCT_TYPE";
      return null;
    })
    .find((value) => value !== null);
  if (field) return field as ResearchTargetField;
  const inferred = task.riskCodes
    .map((code) => code === "PENDING_IDENTIFIER" ? "PRODUCT_CODE" as const : null)
    .find((value) => value !== null);
  return (inferred as ResearchTargetField | null | undefined) ?? "CANONICAL_IDENTITY";
}

export function claimFieldToResearchTarget(field: ResearchClaimField): ResearchTargetField {
  return targetByClaimField[field];
}

export function durableTaskFromFoundation(task: ResearchTask): DurableResearchTask {
  return durableTask({
    id: task.id,
    subjectId: task.subjectId,
    targetField: targetForFoundationTask(task),
    question: task.question,
    priority: task.priority,
    evidenceNeeded: task.requiredEvidence,
    riskCodes: task.riskCodes,
    now: new Date(task.createdAt),
  });
}

export function durableTasksFromScan(scan: ResearchScanResult): DurableResearchTask[] {
  return scan.items.flatMap((item) => item.tasks.map(durableTaskFromFoundation));
}

export function scanAndBuildDurableTasks(options: ResearchCatalogScanOptions = {}): {
  scan: ResearchScanResult;
  tasks: DurableResearchTask[];
} {
  const scan = scanResearchCatalog(options);
  return { scan, tasks: durableTasksFromScan(scan) };
}
