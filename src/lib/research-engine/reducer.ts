import { evidenceKindStrength } from "./source-policy";
import type {
  ResearchClaim,
  ResearchClaimField,
  ResearchClaimResolution,
  ResearchEvidence,
} from "./types";

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(Object.fromEntries(entries));
  }
  return JSON.stringify(value);
}

function bounded(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function scoreResearchClaim(claim: ResearchClaim, evidenceById: Map<string, ResearchEvidence>): number {
  const evidenceStrength = claim.evidenceIds.length === 0
    ? 0.25
    : Math.max(...claim.evidenceIds.map((id) => evidenceKindStrength(evidenceById.get(id)?.kind ?? "UNKNOWN")));
  return bounded(claim.confidence) * bounded(claim.sourceStrength) * evidenceStrength;
}

export function resolveResearchClaims(
  field: ResearchClaimField,
  claims: ResearchClaim[],
  evidence: ResearchEvidence[],
): ResearchClaimResolution {
  const relevant = claims.filter((claim) => claim.field === field);
  if (relevant.length === 0) {
    return { field, status: "UNRESOLVED", value: null, score: 0, competingValues: [] };
  }

  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const groups = new Map<string, { value: unknown; score: number; claimIds: string[] }>();
  for (const claim of relevant) {
    const key = stableValue(claim.value);
    const existing = groups.get(key) ?? { value: claim.value, score: 0, claimIds: [] };
    existing.score += scoreResearchClaim(claim, evidenceById);
    existing.claimIds.push(claim.id);
    groups.set(key, existing);
  }

  const ranked = [...groups.values()]
    .map((entry) => ({ ...entry, score: Math.round(entry.score * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const margin = winner.score - (runnerUp?.score ?? 0);

  let status: ResearchClaimResolution["status"];
  if (winner.score >= 1.35 && margin >= 0.35) status = "CONFIRMED";
  else if (winner.score >= 0.7 && margin >= 0.2) status = "PROVISIONAL";
  else if (ranked.length > 1 && margin < 0.2) status = "CONFLICT";
  else status = "UNRESOLVED";

  return {
    field,
    status,
    value: status === "CONFLICT" || status === "UNRESOLVED" ? null : winner.value,
    score: winner.score,
    competingValues: ranked,
  };
}

export function resolveAllResearchClaims(
  claims: ResearchClaim[],
  evidence: ResearchEvidence[],
): ResearchClaimResolution[] {
  const fields = [...new Set(claims.map((claim) => claim.field))];
  return fields.map((field) => resolveResearchClaims(field, claims, evidence));
}
