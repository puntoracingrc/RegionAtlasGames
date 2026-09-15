import type { ResearchQuery, ResearchRisk, ResearchSubject, ResearchTask, ResearchTaskKind } from "./types";

function uniqueQueries(values: ResearchQuery[]): ResearchQuery[] {
  const seen = new Set<string>();
  return values.filter((entry) => {
    const key = entry.query.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function editionLabel(subject: ResearchSubject): string {
  const edition = subject.edition.trim();
  return edition && edition.toLowerCase() !== "standard" ? edition : "";
}

function plannedQuery(purpose: ResearchTaskKind, text: string): ResearchQuery {
  return { query: text.trim(), purpose, priority: "P1" };
}

export function buildInitialResearchQueries(subject: ResearchSubject, risks: ResearchRisk[]): ResearchQuery[] {
  const base = [subject.title, editionLabel(subject), subject.platformSlug].filter(Boolean).join(" ");
  const barcode = subject.barcode?.trim() ?? "";
  const productCode = subject.productCodes[0]?.trim() ?? "";
  const queries: ResearchQuery[] = [];

  if (barcode) {
    queries.push(plannedQuery("RESOLVE_BARCODE", `"${barcode}"`));
    queries.push(plannedQuery("RESOLVE_PACKAGING", `"${barcode}" back cover`));
    queries.push(plannedQuery("RESOLVE_MARKET", `"${barcode}" ${subject.title}`));
  } else {
    queries.push(plannedQuery("RESOLVE_BARCODE", `${base} barcode EAN UPC JAN`));
  }

  if (productCode) {
    queries.push(plannedQuery("VERIFY_PLATFORM", `"${productCode}" ${subject.title}`));
  }

  queries.push(plannedQuery("RESOLVE_MARKET", `${base} physical edition region`));

  const codes = new Set(risks.map((risk) => risk.code));
  if (codes.has("PLATFORM_IDENTIFIER_CONFLICT")) {
    queries.push(plannedQuery("VERIFY_PLATFORM", `${base} product code serial`));
    if (barcode) queries.push(plannedQuery("VERIFY_PLATFORM", `"${barcode}" ${subject.platformSlug}`));
  }
  if (codes.has("PHYSICAL_STATUS_CONFLICT") || codes.has("DOWNLOAD_CODE_COUNTED_AS_DISC")) {
    queries.push(plannedQuery("VERIFY_PHYSICAL_STATUS", `${base} disc cartridge download code code in box`));
    queries.push(plannedQuery("VERIFY_PHYSICAL_STATUS", `${base} unboxing physical contents`));
  }
  if (codes.has("CANCELED_RELEASE_COUNTED_AS_PHYSICAL")) {
    queries.push(plannedQuery("VERIFY_PHYSICAL_STATUS", `${base} cancelled canceled physical release`));
  }
  if (codes.has("STEELBOOK_WITHOUT_GAME_COUNTED_AS_EDITION")) {
    queries.push(plannedQuery("VERIFY_PHYSICAL_STATUS", `${base} steelbook no game case only`));
  }
  if (codes.has("MISSING_PACKAGING_LANGUAGES")) {
    queries.push(plannedQuery("RESOLVE_PACKAGING", `${base} back cover packaging language`));
  }
  if (codes.has("GENERIC_REGION") || codes.has("MISSING_MARKET_MAPPING")) {
    queries.push(plannedQuery("RESOLVE_MARKET", `${base} Spain France Germany Italy UK Australia USA Japan`));
  }

  return uniqueQueries(queries).slice(0, 14);
}

export function buildTaskQueries(subject: ResearchSubject, task: ResearchTask): ResearchQuery[] {
  const baseRisks: ResearchRisk[] = task.riskCodes.map((code) => ({
    code,
    priority: task.priority,
    weight: 0,
    reason: task.question,
  }));
  const planned = buildInitialResearchQueries(subject, baseRisks)
    .map((entry) => ({ ...entry, purpose: task.kind, priority: task.priority }));

  if (task.kind === "RESOLVE_CONFLICT") {
    planned.push({
      query: `${subject.title} ${subject.platformSlug} ${subject.barcode ?? ""} compare physical variants`,
      purpose: task.kind,
      priority: task.priority,
    });
  }

  return uniqueQueries(planned).slice(0, 16);
}
