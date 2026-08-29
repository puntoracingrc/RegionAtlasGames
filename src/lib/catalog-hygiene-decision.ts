export type CatalogHygieneIssue = {
  source?: string;
  severity?: string;
  kind?: string;
  recordId?: string;
  field?: string;
  value?: string;
  decodedValue?: string;
  suggestedId?: string;
  suggestedIdExists?: boolean;
};

export type CatalogHygieneDecision =
  | "runtime_decode"
  | "preserve_identifier"
  | "preserve_source_path"
  | "manual_collision"
  | "manual_review";

export type CatalogHygieneDecisionSummary = {
  catalogRecords: number;
  totalRecords: number;
  runtimeProtectedRecords: number;
  preservedIdentifierRecords: number;
  preservedSourcePathRecords: number;
  manualReviewRecords: number;
  collisionRecords: number;
  byDecision: Record<CatalogHygieneDecision, number>;
};

const IDENTIFIER_FIELDS = new Set([
  "id",
  "slug",
  "$key",
  "catalogId",
  "candidateCatalogId",
  "matchedCatalogId",
  "resolvedCatalogId",
]);

const DISPLAY_FIELDS = new Set(["title", "titlePc", "description", "reference"]);
const SOURCE_PATH_FIELDS = new Set(["pcPath", "coverUrl", "museumPath"]);

function fieldTail(field: string | undefined): string {
  if (!field) return "";
  return field.replace(/\[\d+\]/g, "").split(".").at(-1) ?? field;
}

export function catalogHygieneDecision(issue: CatalogHygieneIssue): CatalogHygieneDecision {
  if (issue.suggestedIdExists && issue.suggestedId && issue.suggestedId !== issue.value) {
    return "manual_collision";
  }
  const field = fieldTail(issue.field);
  if (IDENTIFIER_FIELDS.has(field)) return "preserve_identifier";
  if (SOURCE_PATH_FIELDS.has(field)) return "preserve_source_path";
  if (DISPLAY_FIELDS.has(field) || issue.severity === "text") return "runtime_decode";
  return "manual_review";
}

function uniqueRecordCount(
  issues: CatalogHygieneIssue[],
  predicate: (issue: CatalogHygieneIssue) => boolean,
): number {
  return new Set(
    issues
      .filter(predicate)
      .map((issue) => `${issue.source ?? "unknown"}:${issue.recordId ?? issue.value ?? "unknown"}`),
  ).size;
}

export function summarizeCatalogHygiene(
  issues: CatalogHygieneIssue[],
): CatalogHygieneDecisionSummary {
  const byDecision: Record<CatalogHygieneDecision, number> = {
    runtime_decode: 0,
    preserve_identifier: 0,
    preserve_source_path: 0,
    manual_collision: 0,
    manual_review: 0,
  };
  for (const issue of issues) byDecision[catalogHygieneDecision(issue)] += 1;

  return {
    catalogRecords: new Set(
      issues
        .filter((issue) => issue.source === "catalog")
        .map((issue) => issue.recordId ?? issue.value ?? "unknown"),
    ).size,
    totalRecords: uniqueRecordCount(issues, () => true),
    runtimeProtectedRecords: uniqueRecordCount(
      issues,
      (issue) => catalogHygieneDecision(issue) === "runtime_decode",
    ),
    preservedIdentifierRecords: new Set(
      issues
        .filter((issue) => {
          const decision = catalogHygieneDecision(issue);
          return issue.source === "catalog" &&
            (decision === "preserve_identifier" || decision === "manual_collision");
        })
        .map((issue) => issue.recordId ?? issue.value ?? "unknown"),
    ).size,
    preservedSourcePathRecords: uniqueRecordCount(
      issues,
      (issue) => catalogHygieneDecision(issue) === "preserve_source_path",
    ),
    manualReviewRecords: uniqueRecordCount(
      issues,
      (issue) => {
        const decision = catalogHygieneDecision(issue);
        return decision === "manual_collision" || decision === "manual_review";
      },
    ),
    collisionRecords: new Set(
      issues
        .filter((issue) => catalogHygieneDecision(issue) === "manual_collision")
        .map((issue) => issue.suggestedId ?? issue.value ?? issue.recordId ?? "unknown"),
    ).size,
    byDecision,
  };
}
