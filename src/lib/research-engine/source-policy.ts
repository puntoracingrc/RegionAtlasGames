import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResearchClaimField, ResearchEvidenceKind } from "./types";
import type { ResearchSourceDefinition, ResearchTargetField } from "./v2-types";

type SourceProfile = { kind: ResearchEvidenceKind; strength: number; supports: ResearchClaimField[] };

const CLAIM_TO_TARGET: Record<ResearchClaimField, ResearchTargetField[]> = {
  physicalExistence: ["PHYSICAL_EXISTENCE"], physicalContentStatus: ["PHYSICAL_PRODUCT_TYPE"], releaseStatus: ["RELEASE_STATUS"],
  platform: ["CANONICAL_IDENTITY", "PRODUCT_CODE", "SERIAL"], edition: ["CANONICAL_IDENTITY", "COLLECTOR_CONTENTS"],
  barcode: ["BARCODE"], productCode: ["PRODUCT_CODE", "BOX_CODE", "SERIAL", "MEDIA_ID"],
  market: ["MARKET_REGION", "EVIDENCE_MARKET", "DISTRIBUTION_MARKET"], packagingLanguages: ["PACKAGING_LANGUAGES"],
  softwareLanguages: ["SOFTWARE_LANGUAGES"], contents: ["BUNDLE_CONTENTS", "COLLECTOR_CONTENTS", "OUTER_INNER_RELATION"],
};

function readRegistry(): ResearchSourceDefinition[] {
  const relative = path.join("data", "research-engine", "knowledge", "sources.json");
  let raw: string;
  try { raw = readFileSync(path.join(process.cwd(), relative), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    raw = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../", relative), "utf8");
  }
  const parsed = JSON.parse(raw) as { schemaVersion?: number; sources?: ResearchSourceDefinition[] };
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sources)) throw new Error("INVALID_RESEARCH_SOURCE_REGISTRY");
  return parsed.sources;
}

const SOURCE_REGISTRY = readRegistry();
const FALLBACK_PROFILE: SourceProfile = { kind: "UNKNOWN", strength: 0.35, supports: [] };
const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/^www\./, "");

function kindFor(source: ResearchSourceDefinition): ResearchEvidenceKind {
  const roles = source.roles.join(" ").toUpperCase();
  if (roles.includes("OWN_SCAN")) return "OWN_SCAN";
  if (roles.includes("PLATFORM_HOLDER")) return "PLATFORM_HOLDER";
  if (roles.includes("PUBLISHER")) return "PUBLISHER";
  if (roles.includes("TECHNICAL")) return "TECHNICAL_DATABASE";
  if (roles.includes("RETAILER")) return "RETAILER";
  if (roles.includes("MARKETPLACE")) return "MARKETPLACE";
  if (roles.includes("SPECIALIZED") || roles.includes("RELEASE_IDENTITY")) return "COLLECTOR_DATABASE";
  return "UNKNOWN";
}

function profileForSource(source: ResearchSourceDefinition): SourceProfile {
  const supports = (Object.keys(CLAIM_TO_TARGET) as ResearchClaimField[]).filter((claim) =>
    CLAIM_TO_TARGET[claim].some((field) => (source.fieldCapabilities[field] ?? 0) >= 50));
  return { kind: kindFor(source), strength: Math.max(0, Math.min(1, source.defaultReliability / 100)), supports };
}

export function sourceProfileForUrl(url: string | null | undefined): SourceProfile {
  if (!url) return FALLBACK_PROFILE;
  let host: string;
  try { host = normalizeHost(new URL(url).hostname); } catch { return FALLBACK_PROFILE; }
  const source = SOURCE_REGISTRY.find((entry) => entry.hosts.some((candidate) => normalizeHost(candidate) === host));
  return source ? profileForSource(source) : FALLBACK_PROFILE;
}

export function sourceCanSupportClaim(url: string | null | undefined, field: ResearchClaimField): boolean {
  return sourceProfileForUrl(url).supports.includes(field);
}

export function sourceStrengthForClaim(url: string | null | undefined, field: ResearchClaimField): number {
  const profile = sourceProfileForUrl(url);
  return profile.supports.includes(field) ? profile.strength : Math.min(profile.strength, 0.3);
}

export function evidenceKindStrength(kind: ResearchEvidenceKind): number {
  switch (kind) {
    case "OWN_SCAN": return 1;
    case "PHYSICAL_SCAN": return 0.98;
    case "PUBLISHER": return 0.96;
    case "PLATFORM_HOLDER": return 0.94;
    case "TECHNICAL_DATABASE": return 0.93;
    case "RETAILER": return 0.8;
    case "COLLECTOR_DATABASE": return 0.66;
    case "MARKETPLACE": return 0.45;
    case "SEARCH_RESULT": return 0.3;
    default: return 0.25;
  }
}

export function authoritativeResearchSourceRegistry(): readonly ResearchSourceDefinition[] {
  return SOURCE_REGISTRY;
}
