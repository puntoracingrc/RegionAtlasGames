import rulesData from "../../data/region-evidence-rules.json";
import type { ListingRegionEvidence } from "./listing-region-verification";

type RegionRuleBlock = {
  requiredAnyOf?: string[];
  minEvidenceCount?: number;
  forbiddenEvidence?: string[];
  minAiConfidence?: number;
  summary?: string;
};

type RulesFile = {
  default: RegionRuleBlock;
  catalogRegionOverrides: Record<string, RegionRuleBlock>;
  platforms: Record<string, RegionRuleBlock & { catalogRegionOverrides?: Record<string, RegionRuleBlock> }>;
  evidenceLabels: Record<string, string>;
};

const rules = rulesData as RulesFile;

function normalizeRegion(region: string): string {
  return region.trim().toLowerCase();
}

function mergeRule(...blocks: (RegionRuleBlock | undefined)[]): RegionRuleBlock {
  const merged: RegionRuleBlock = {};
  for (const block of blocks) {
    if (!block) continue;
    if (block.requiredAnyOf) merged.requiredAnyOf = block.requiredAnyOf;
    if (block.minEvidenceCount != null) merged.minEvidenceCount = block.minEvidenceCount;
    if (block.forbiddenEvidence) merged.forbiddenEvidence = block.forbiddenEvidence;
    if (block.minAiConfidence != null) merged.minAiConfidence = block.minAiConfidence;
    if (block.summary) merged.summary = block.summary;
  }
  return merged;
}

/** Reglas efectivas para un título concreto (plataforma + región catálogo). */
export function getRegionEvidenceRule(platformSlug: string, catalogRegion: string): RegionRuleBlock {
  const regionKey = normalizeRegion(catalogRegion);
  const platform = rules.platforms[platformSlug];

  return mergeRule(
    rules.default,
    rules.catalogRegionOverrides[regionKey],
    platform,
    platform?.catalogRegionOverrides?.[regionKey],
  );
}

export function getEvidenceLabel(code: string): string {
  return rules.evidenceLabels[code] ?? code;
}

export type EvidenceCheckResult =
  | { ok: true }
  | { ok: false; reason: "insufficient_count" | "missing_required" | "forbidden" | "low_ai_confidence" };

export function checkListingEvidenceMeetsRules(input: {
  platformSlug: string;
  catalogRegion: string;
  regionEvidence: string[];
  aiConfidence?: number | null;
}): EvidenceCheckResult {
  const rule = getRegionEvidenceRule(input.platformSlug, input.catalogRegion);
  const evidence = new Set(input.regionEvidence.map((e) => e.trim()).filter(Boolean));

  const minCount = rule.minEvidenceCount ?? rules.default.minEvidenceCount ?? 1;
  if (evidence.size < minCount) {
    return { ok: false, reason: "insufficient_count" };
  }

  const requiredAny = rule.requiredAnyOf ?? [];
  if (requiredAny.length > 0 && !requiredAny.some((code) => evidence.has(code))) {
    return { ok: false, reason: "missing_required" };
  }

  const forbidden = rule.forbiddenEvidence ?? [];
  if (forbidden.some((code) => evidence.has(code))) {
    return { ok: false, reason: "forbidden" };
  }

  const minAi = rule.minAiConfidence ?? rules.default.minAiConfidence;
  if (
    minAi != null &&
    input.aiConfidence != null &&
    input.aiConfidence < minAi
  ) {
    return { ok: false, reason: "low_ai_confidence" };
  }

  return { ok: true };
}

export function formatRegionEvidenceRuleSummary(platformSlug: string, catalogRegion: string): string {
  const rule = getRegionEvidenceRule(platformSlug, catalogRegion);
  if (rule.summary) return rule.summary;

  const required = rule.requiredAnyOf ?? [];
  if (required.length === 0) {
    return `Al menos ${rule.minEvidenceCount ?? 1} prueba de región verificada.`;
  }

  const labels = required.map((code) => getEvidenceLabel(code));
  return `Al menos una de: ${labels.join("; ")}.`;
}

export function listRequiredEvidenceCodes(
  platformSlug: string,
  catalogRegion: string,
): ListingRegionEvidence[] {
  const rule = getRegionEvidenceRule(platformSlug, catalogRegion);
  return (rule.requiredAnyOf ?? []) as ListingRegionEvidence[];
}
