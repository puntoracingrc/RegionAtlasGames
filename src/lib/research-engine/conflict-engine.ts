import { createHash } from "node:crypto";
import { evidenceBindingAcceptable } from "./evidence-binding";
import type {
  ResearchClaimRecord,
  ResearchConflict,
  ResearchEvidenceRecord,
  ResearchTargetField,
} from "./v2-types";

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))));
  }
  return JSON.stringify(value);
}

function conflictId(field: ResearchTargetField, values: unknown[]): string {
  return `conflict-${createHash("sha256").update(`${field}:${values.map(stableValue).sort().join("|")}`).digest("hex").slice(0, 20)}`;
}

export type ResearchFieldResolution = {
  field: ResearchTargetField;
  status: "CONFIRMED" | "PARTIAL" | "CONFLICT" | "UNRESOLVED";
  value: unknown | null;
  score: number;
  claimIds: string[];
  sourceIds: string[];
  reason: string;
};

function eligibleClaim(claim: ResearchClaimRecord, evidence: ResearchEvidenceRecord | undefined): boolean {
  return claim.status !== "REJECTED"
    && claim.validationErrors.length === 0
    && Boolean(evidence)
    && evidenceBindingAcceptable(evidence!.subjectBinding)
    && evidence!.capabilities.includes(claim.field);
}

export function resolveResearchClaimRecords(input: {
  field: ResearchTargetField;
  claims: ResearchClaimRecord[];
  evidence: ResearchEvidenceRecord[];
}): { resolution: ResearchFieldResolution; conflicts: ResearchConflict[]; claims: ResearchClaimRecord[] } {
  const evidenceById = new Map(input.evidence.map((evidence) => [evidence.id, evidence]));
  const normalizedClaims = input.claims.map((claim) => {
    const evidence = evidenceById.get(claim.evidenceId);
    if (!eligibleClaim(claim, evidence)) {
      const bindingError = evidence && !evidenceBindingAcceptable(evidence.subjectBinding)
        ? evidence.subjectBinding.risks.includes("CROSS_ATTRIBUTION_RISK")
          ? "CROSS_ATTRIBUTION_RISK"
          : "SUBJECT_BINDING_INCOMPLETE"
        : null;
      return {
        ...claim,
        status: "REJECTED" as const,
        validationErrors: [...new Set([
          ...claim.validationErrors,
          ...(!evidence ? ["MISSING_EVIDENCE"] : []),
          ...(bindingError ? [bindingError] : []),
          ...(evidence && !evidence.capabilities.includes(claim.field) ? ["SOURCE_CAPABILITY_MISMATCH"] : []),
        ])],
      };
    }
    return claim;
  });
  const relevant = normalizedClaims.filter((claim) => claim.field === input.field && claim.status !== "REJECTED");
  if (!relevant.length) {
    return {
      resolution: { field: input.field, status: "UNRESOLVED", value: null, score: 0, claimIds: [], sourceIds: [], reason: "No eligible field-level claims." },
      conflicts: [],
      claims: normalizedClaims,
    };
  }
  const groups = new Map<string, {
    value: unknown;
    score: number;
    claimIds: string[];
    sources: Set<string>;
    exactPhysicalEvidence: boolean;
  }>();
  for (const claim of relevant) {
    const evidence = evidenceById.get(claim.evidenceId)!;
    const key = stableValue(claim.value);
    const current = groups.get(key) ?? { value: claim.value, score: 0, claimIds: [], sources: new Set(), exactPhysicalEvidence: false };
    current.score += Math.max(0, Math.min(1, claim.confidence)) * Math.max(0, Math.min(100, evidence.reliability)) / 100;
    current.claimIds.push(claim.id);
    current.sources.add(claim.sourceId);
    current.exactPhysicalEvidence ||= ["OWN_SCAN", "EXACT_PHYSICAL_PHOTO", "REAL_SCAN", "REAL_PHOTO"].includes(evidence.evidenceType);
    groups.set(key, current);
  }
  const ranked = [...groups.values()].sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const highConflict = Boolean(runnerUp && runnerUp.score >= 0.6 && winner.score - runnerUp.score < 0.55);
  const conflicts: ResearchConflict[] = [];
  if (ranked.length > 1) {
    const values = ranked.map((group) => group.value);
    conflicts.push({
      id: conflictId(input.field, values),
      field: input.field,
      claimIds: ranked.flatMap((group) => group.claimIds),
      values,
      severity: highConflict ? "HIGH" : "MODERATE",
      reason: highConflict ? "Competing well-supported values remain unresolved." : "A weaker competing value was preserved for audit.",
      nextEvidenceNeeded: ["EXACT_SUBJECT_BINDING", "INDEPENDENT_SOURCE", "COMPONENT_SPECIFIC_EVIDENCE"],
    });
  }
  if (highConflict) {
    return {
      resolution: {
        field: input.field,
        status: "CONFLICT",
        value: null,
        score: Math.round(winner.score * 1_000) / 1_000,
        claimIds: winner.claimIds,
        sourceIds: [...winner.sources],
        reason: "Conflicting values are too close to resolve safely.",
      },
      conflicts,
      claims: normalizedClaims.map((claim) => relevant.some((row) => row.id === claim.id) ? { ...claim, status: "CONFLICT" } : claim),
    };
  }
  const confirmed = winner.exactPhysicalEvidence && winner.score >= 0.8
    || winner.sources.size >= 2 && winner.score >= 1.35;
  const partial = !confirmed && winner.score >= 0.6;
  const status = confirmed ? "CONFIRMED" : partial ? "PARTIAL" : "UNRESOLVED";
  return {
    resolution: {
      field: input.field,
      status,
      value: status === "UNRESOLVED" ? null : winner.value,
      score: Math.round(winner.score * 1_000) / 1_000,
      claimIds: winner.claimIds,
      sourceIds: [...winner.sources],
      reason: confirmed
        ? winner.exactPhysicalEvidence ? "Exact physical evidence supports the field." : "Independent sources corroborate the field."
        : partial ? "A plausible value exists but confirmation threshold is not met." : "Evidence remains too weak.",
    },
    conflicts,
    claims: normalizedClaims.map((claim) => winner.claimIds.includes(claim.id) && status !== "UNRESOLVED"
      ? { ...claim, status: "VALIDATED" }
      : claim),
  };
}

export function crossAttributionConflicts(evidence: ResearchEvidenceRecord[]): ResearchConflict[] {
  return evidence.flatMap((item) => item.subjectBinding.risks.includes("CROSS_ATTRIBUTION_RISK") ? [{
    id: `cross-${item.id}`,
    field: (item.capabilities[0] ?? "CANONICAL_IDENTITY") as ResearchTargetField,
    claimIds: [],
    values: [],
    severity: "CRITICAL" as const,
    reason: `Evidence ${item.id} is bound to the wrong game/platform/edition/variant/component.`,
    nextEvidenceNeeded: ["CORRECT_EXACT_SUBJECT", "EXACT_COMPONENT_PHOTO"],
  }] : []);
}
